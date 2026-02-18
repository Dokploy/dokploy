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
 * Escape a string for safe use in shell commands.
 * Wraps the value in single quotes and escapes any embedded single quotes.
 */
export const shellEscape = (str: string): string => {
	return `'${str.replace(/'/g, "'\\''")}'`;
};

/**
 * Escape a string for safe embedding inside double-quoted shell strings.
 * Prevents interpretation of $, `, \, ", and ! characters.
 */
const escapeForDoubleQuotes = (str: string): string => {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/\$/g, "\\$")
		.replace(/`/g, "\\`")
		.replace(/"/g, '\\"')
		.replace(/!/g, "\\!");
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

/**
 * Get rclone flags for S3-compatible destinations.
 * Kept as getS3Credentials for backward compatibility.
 */
export const getS3Credentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const rcloneFlags = [
		`--s3-access-key-id=${shellEscape(accessKey)}`,
		`--s3-secret-access-key=${shellEscape(secretAccessKey)}`,
		`--s3-region=${shellEscape(region)}`,
		`--s3-endpoint=${shellEscape(endpoint)}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneFlags.unshift(`--s3-provider=${shellEscape(provider)}`);
	}

	return rcloneFlags;
};

/**
 * Get rclone flags for SFTP destinations.
 */
export const getSftpCredentials = (destination: Destination) => {
	const { sftpHost, sftpPort, sftpUsername, sftpPassword, sftpKeyPath } =
		destination;
	const rcloneFlags = [
		`--sftp-host=${shellEscape(sftpHost || "")}`,
		`--sftp-user=${shellEscape(sftpUsername || "")}`,
	];

	if (sftpPort) {
		rcloneFlags.push(`--sftp-port=${shellEscape(String(sftpPort))}`);
	}

	if (sftpPassword) {
		const obscuredPass = `$(rclone obscure ${shellEscape(sftpPassword)})`;
		rcloneFlags.push(`--sftp-pass=${obscuredPass}`);
	}

	if (sftpKeyPath) {
		rcloneFlags.push(`--sftp-key-file=${shellEscape(sftpKeyPath)}`);
	}

	return rcloneFlags;
};

/**
 * Get rclone flags based on destination type.
 * Unified function that handles all destination types.
 */
export const getRcloneFlags = (destination: Destination): string[] => {
	const destType = destination.destinationType || "s3";

	switch (destType) {
		case "s3":
			return getS3Credentials(destination);
		case "sftp":
			return getSftpCredentials(destination);
		case "rclone":
			// For generic rclone config, no additional flags needed
			// as the config file will be used
			return [];
		default:
			return getS3Credentials(destination);
	}
};

/**
 * Get the rclone remote path prefix based on destination type.
 * For S3: `:s3:bucket/path`
 * For SFTP: `:sftp:remotePath/path`
 * For rclone: `remoteName:remotePath/path`
 */
export const getRcloneDestinationPath = (
	destination: Destination,
	subPath: string,
): string => {
	const destType = destination.destinationType || "s3";
	switch (destType) {
		case "s3":
			return `:s3:${escapeForDoubleQuotes(destination.bucket)}/${escapeForDoubleQuotes(subPath)}`;
		case "sftp": {
			const remotePath = (destination.sftpRemotePath || "").replace(
				/\/+$/,
				"",
			);
			return `:sftp:${escapeForDoubleQuotes(remotePath)}/${escapeForDoubleQuotes(subPath)}`;
		}
		case "rclone": {
			const remoteName = destination.rcloneRemoteName || "remote";
			const remotePath = (destination.rcloneRemotePath || "").replace(
				/\/+$/,
				"",
			);
			return `${escapeForDoubleQuotes(remoteName)}:${escapeForDoubleQuotes(remotePath)}/${escapeForDoubleQuotes(subPath)}`;
		}
		default:
			return `:s3:${escapeForDoubleQuotes(destination.bucket)}/${escapeForDoubleQuotes(subPath)}`;
	}
};

/**
 * Get the rclone base path for listing/deleting files (bucket or remote path).
 */
export const getRcloneBasePath = (
	destination: Destination,
	prefix: string,
): string => {
	const destType = destination.destinationType || "s3";

	switch (destType) {
		case "s3":
			return `:s3:${escapeForDoubleQuotes(destination.bucket)}/${escapeForDoubleQuotes(prefix)}`;
		case "sftp": {
			const remotePath = (destination.sftpRemotePath || "").replace(
				/\/+$/,
				"",
			);
			return `:sftp:${escapeForDoubleQuotes(remotePath)}/${escapeForDoubleQuotes(prefix)}`;
		}
		case "rclone": {
			const remoteName = destination.rcloneRemoteName || "remote";
			const remotePath = (destination.rcloneRemotePath || "").replace(
				/\/+$/,
				"",
			);
			return `${escapeForDoubleQuotes(remoteName)}:${escapeForDoubleQuotes(remotePath)}/${escapeForDoubleQuotes(prefix)}`;
		}
		default:
			return `:s3:${escapeForDoubleQuotes(destination.bucket)}/${escapeForDoubleQuotes(prefix)}`;
	}
};

/**
 * Generate the rclone config file content and env setup for rclone destinations.
 * Returns the shell commands to create the config file.
 */
export const getRcloneConfigSetup = (destination: Destination): string => {
	if (destination.destinationType !== "rclone" || !destination.rcloneConfig) {
		return "";
	}

	const configContent = destination.rcloneConfig.replace(/'/g, "'\\''");
	return `
RCLONE_CONFIG_FILE=$(mktemp /tmp/rclone-config-XXXXXX.conf)
cat > "$RCLONE_CONFIG_FILE" << 'RCLONE_EOF'
${configContent}
RCLONE_EOF
export RCLONE_CONFIG="$RCLONE_CONFIG_FILE"
_cleanup_rclone_config() { rm -f "$RCLONE_CONFIG_FILE"; }
trap _cleanup_rclone_config EXIT
`;
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
	const destinationType = backup.destination.destinationType || "s3";
	const uploadLabel =
		destinationType === "s3"
			? "S3"
			: destinationType === "sftp"
				? "SFTP"
				: "remote";

	logger.info(
		{
			containerSearch,
			backupCommand,
			rcloneCommand,
			logPath,
		},
		`Executing backup command: ${backup.databaseType} ${backup.backupType}`,
	);

	const configSetup = getRcloneConfigSetup(backup.destination);

	return `
	set -eo pipefail;
	${configSetup}
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
	echo "[$(date)] Starting upload to ${uploadLabel}..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to ${uploadLabel} failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to ${uploadLabel} completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
