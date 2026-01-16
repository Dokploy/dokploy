import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { keepLatestNBackups } from ".";
import { runComposeBackup } from "./compose";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { runWebServerBackup } from "./web-server";

/**
 * Get S3 rclone remote with optional transparent crypt encryption.
 * When encryption is enabled, returns a crypt-wrapped remote using rclone's
 * native crypt backend (NaCl SecretBox: XSalsa20 + Poly1305).
 *
 * Uses connection string syntax for inline remote configuration.
 * Encryption passwords are passed via environment variables (more secure than CLI args).
 *
 * @see https://rclone.org/crypt/
 * @see https://rclone.org/docs/#connection-strings
 */
export const getRcloneS3Remote = (
	destination: Destination,
): {
	remote: string;
	envVars: string;
} => {
	const { accessKey, secretAccessKey, region, endpoint, provider, bucket } =
		destination;

	// Build S3 connection string (credentials embedded in remote)
	let s3Remote = `:s3,access_key_id="${accessKey}",secret_access_key="${secretAccessKey}",region="${region}",endpoint="${endpoint}",no_check_bucket=true,force_path_style=true`;
	if (provider) {
		s3Remote = `:s3,provider="${provider}",access_key_id="${accessKey}",secret_access_key="${secretAccessKey}",region="${region}",endpoint="${endpoint}",no_check_bucket=true,force_path_style=true`;
	}

	// If encryption enabled, wrap S3 remote with crypt
	if (destination.encryptionEnabled && destination.encryptionKey) {
		const filenameEncryption = destination.filenameEncryption || "off";
		const directoryNameEncryption =
			destination.directoryNameEncryption ?? false;

		// Crypt remote wraps S3 transparently
		const cryptRemote = `:crypt,remote="${s3Remote}:${bucket}",filename_encryption=${filenameEncryption},directory_name_encryption=${directoryNameEncryption}:`;

		// Password via env var (more secure than CLI args)
		const escapedKey = destination.encryptionKey.replace(/'/g, "'\\''");
		let envVars = `RCLONE_CRYPT_PASSWORD='${escapedKey}'`;
		if (destination.encryptionPassword2) {
			const escapedPassword2 = destination.encryptionPassword2.replace(
				/'/g,
				"'\\''",
			);
			envVars = `RCLONE_CRYPT_PASSWORD='${escapedKey}' RCLONE_CRYPT_PASSWORD2='${escapedPassword2}'`;
		}

		return { remote: cryptRemote, envVars };
	}

	// No encryption - use plain S3 remote with connection string
	return { remote: `${s3Remote}:${bucket}`, envVars: "" };
};

/**
 * Build rclone command with optional encryption environment variables.
 * Prepends env vars to the command when provided.
 */
export const buildRcloneCommand = (
	command: string,
	envVars?: string,
): string => {
	if (envVars) {
		return `${envVars} ${command}`;
	}
	return command;
};

/**
 * Legacy function for backwards compatibility.
 * Returns rclone flags for S3 access (non-encrypted destinations only).
 * @deprecated Use getRcloneS3Remote instead for encryption support.
 */
export const getS3Credentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const rcloneFlags = [
		`--s3-access-key-id="${accessKey}"`,
		`--s3-secret-access-key="${secretAccessKey}"`,
		`--s3-region="${region}"`,
		`--s3-endpoint="${endpoint}"`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];
	if (provider) {
		rcloneFlags.unshift(`--s3-provider="${provider}"`);
	}
	return rcloneFlags;
};

export const scheduleBackup = (backup: BackupSchedule) => {
	const {
		schedule,
		backupId,
		databaseType,
		postgres,
		mysql,
		mongo,
		mariadb,
		compose,
	} = backup;
	scheduleJob(backupId, schedule, async () => {
		if (backup.backupType === "database") {
			if (databaseType === "postgres" && postgres) {
				await runPostgresBackup(postgres, backup);
				await keepLatestNBackups(backup, postgres.serverId);
			} else if (databaseType === "mysql" && mysql) {
				await runMySqlBackup(mysql, backup);
				await keepLatestNBackups(backup, mysql.serverId);
			} else if (databaseType === "mongo" && mongo) {
				await runMongoBackup(mongo, backup);
				await keepLatestNBackups(backup, mongo.serverId);
			} else if (databaseType === "mariadb" && mariadb) {
				await runMariadbBackup(mariadb, backup);
				await keepLatestNBackups(backup, mariadb.serverId);
			} else if (databaseType === "web-server") {
				await runWebServerBackup(backup);
				await keepLatestNBackups(backup);
			}
		} else if (backup.backupType === "compose" && compose) {
			await runComposeBackup(compose, backup);
			await keepLatestNBackups(backup, compose.serverId);
		}
	});
};

export const removeScheduleBackup = (backupId: string) => {
	const currentJob = scheduledJobs[backupId];
	currentJob?.cancel();
};

export const normalizeS3Path = (prefix: string) => {
	// Trim whitespace and remove leading/trailing slashes
	const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	// Return empty string if prefix is empty, otherwise append trailing slash
	return normalizedPrefix ? `${normalizedPrefix}/` : "";
};

export const getBackupRemotePath = (remote: string, prefix?: string | null) => {
	const normalizedPrefix = normalizeS3Path(prefix || "");
	return normalizedPrefix ? `${remote}/${normalizedPrefix}` : remote;
};

export const getPostgresBackupCommand = (
	database: string,
	databaseUser: string,
) => {
	return `docker exec -i $CONTAINER_ID bash -c "set -o pipefail; pg_dump -Fc --no-acl --no-owner -h localhost -U ${databaseUser} --no-password '${database}' | gzip"`;
};

export const getMariadbBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --single-transaction --quick --databases ${database} | gzip"`;
};

export const getMysqlBackupCommand = (
	database: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mysqldump --default-character-set=utf8mb4 -u 'root' --password='${databasePassword}' --single-transaction --no-tablespaces --quick '${database}' | gzip"`;
};

export const getMongoBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mongodump -d '${database}' -u '${databaseUser}' -p '${databasePassword}' --archive --authenticationDatabase admin --gzip"`;
};

export const getServiceContainerCommand = (appName: string) => {
	return `docker ps -q --filter "status=running" --filter "label=com.docker.swarm.service.name=${appName}" | head -n 1`;
};

export const getComposeContainerCommand = (
	appName: string,
	serviceName: string,
	composeType: "stack" | "docker-compose" | undefined,
) => {
	if (composeType === "stack") {
		return `docker ps -q --filter "status=running" --filter "label=com.docker.stack.namespace=${appName}" --filter "label=com.docker.swarm.service.name=${appName}_${serviceName}" | head -n 1`;
	}
	return `docker ps -q --filter "status=running" --filter "label=com.docker.compose.project=${appName}" --filter "label=com.docker.compose.service=${serviceName}" | head -n 1`;
};

const getContainerSearchCommand = (backup: BackupSchedule) => {
	const { backupType, postgres, mysql, mariadb, mongo, compose, serviceName } =
		backup;

	if (backupType === "database") {
		const appName =
			postgres?.appName || mysql?.appName || mariadb?.appName || mongo?.appName;
		return getServiceContainerCommand(appName || "");
	}
	if (backupType === "compose") {
		const { appName, composeType } = compose || {};
		return getComposeContainerCommand(
			appName || "",
			serviceName || "",
			composeType,
		);
	}
};

export const generateBackupCommand = (backup: BackupSchedule) => {
	const { backupType, databaseType } = backup;
	switch (databaseType) {
		case "postgres": {
			const postgres = backup.postgres;
			if (backupType === "database" && postgres) {
				return getPostgresBackupCommand(backup.database, postgres.databaseUser);
			}
			if (backupType === "compose" && backup.metadata?.postgres) {
				return getPostgresBackupCommand(
					backup.database,
					backup.metadata.postgres.databaseUser,
				);
			}
			break;
		}
		case "mysql": {
			const mysql = backup.mysql;
			if (backupType === "database" && mysql) {
				return getMysqlBackupCommand(
					backup.database,
					mysql.databaseRootPassword,
				);
			}
			if (backupType === "compose" && backup.metadata?.mysql) {
				return getMysqlBackupCommand(
					backup.database,
					backup.metadata?.mysql?.databaseRootPassword || "",
				);
			}
			break;
		}
		case "mariadb": {
			const mariadb = backup.mariadb;
			if (backupType === "database" && mariadb) {
				return getMariadbBackupCommand(
					backup.database,
					mariadb.databaseUser,
					mariadb.databasePassword,
				);
			}
			if (backupType === "compose" && backup.metadata?.mariadb) {
				return getMariadbBackupCommand(
					backup.database,
					backup.metadata.mariadb.databaseUser,
					backup.metadata.mariadb.databasePassword,
				);
			}
			break;
		}
		case "mongo": {
			const mongo = backup.mongo;
			if (backupType === "database" && mongo) {
				return getMongoBackupCommand(
					backup.database,
					mongo.databaseUser,
					mongo.databasePassword,
				);
			}
			if (backupType === "compose" && backup.metadata?.mongo) {
				return getMongoBackupCommand(
					backup.database,
					backup.metadata.mongo.databaseUser,
					backup.metadata.mongo.databasePassword,
				);
			}
			break;
		}
		default:
			throw new Error(`Database type not supported: ${databaseType}`);
	}

	return null;
};

export const getBackupCommand = (
	backup: BackupSchedule,
	rcloneCommand: string,
	logPath: string,
) => {
	const containerSearch = getContainerSearchCommand(backup);
	const backupCommand = generateBackupCommand(backup);

	logger.info(
		{
			containerSearch,
			backupCommand,
			rcloneCommand,
			logPath,
		},
		`Executing backup command: ${backup.databaseType} ${backup.backupType}`,
	);

	const pipelineCommand = `${backupCommand} | ${rcloneCommand}`;

	return `
	set -eo pipefail;
	echo "[$(date)] Starting backup process..." >> ${logPath};
	echo "[$(date)] Executing backup command..." >> ${logPath};
	CONTAINER_ID=$(${containerSearch})

	if [ -z "$CONTAINER_ID" ]; then
		echo "[$(date)] ❌ Error: Container not found" >> ${logPath};
		exit 1;
	fi

	echo "[$(date)] Container Up: $CONTAINER_ID" >> ${logPath};

	# Run the backup command and capture the exit status
	BACKUP_OUTPUT=$(${backupCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Backup failed" >> ${logPath};
		echo "Error: $BACKUP_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ backup completed successfully" >> ${logPath};
	echo "[$(date)] Starting upload to S3..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${pipelineCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to S3 failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to S3 completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
