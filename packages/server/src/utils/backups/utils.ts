import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { keepLatestNBackups } from ".";
import { runComposeBackup } from "./compose";
import { runLibsqlBackup } from "./libsql";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { runWebServerBackup } from "./web-server";

export const scheduleBackup = (backup: BackupSchedule) => {
	const {
		schedule,
		backupId,
		databaseType,
		postgres,
		mysql,
		mongo,
		mariadb,
		libsql,
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
			} else if (databaseType === "libsql" && libsql) {
				await runLibsqlBackup(libsql, backup);
				await keepLatestNBackups(backup, libsql.serverId);
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

export const getBackupTimestamp = () =>
	new Date().toISOString().replace(/[:.]/g, "-");

export const normalizeS3Path = (prefix: string) => {
	// Trim whitespace and remove leading/trailing slashes
	const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	// Return empty string if prefix is empty, otherwise append trailing slash
	return normalizedPrefix ? `${normalizedPrefix}/` : "";
};

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

	if (destination.additionalFlags?.length) {
		rcloneFlags.push(...destination.additionalFlags);
	}

	return rcloneFlags;
};

// For FTP destinations, accessKey=username, secretAccessKey=password,
// endpoint=host, region=port, bucket=remote base path
export const getFTPCredentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint } = destination;
	const port = region || "21";
	const rcloneFlags = [
		`--ftp-host="${endpoint}"`,
		`--ftp-port="${port}"`,
		`--ftp-user="${accessKey}"`,
		`--ftp-pass="${secretAccessKey}"`,
	];

	if (destination.additionalFlags?.length) {
		rcloneFlags.push(...destination.additionalFlags);
	}

	return rcloneFlags;
};

// For SFTP destinations, accessKey=username, secretAccessKey=password,
// endpoint=host, region=port, bucket=remote base path
export const getSFTPCredentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint } = destination;
	const port = region || "22";
	const rcloneFlags = [
		`--sftp-host="${endpoint}"`,
		`--sftp-port="${port}"`,
		`--sftp-user="${accessKey}"`,
	];

	if (destination.additionalFlags?.length) {
		rcloneFlags.push(...destination.additionalFlags);
	}

	// SFTP password must be obscured via rclone; handled in getDestinationRcloneCommand
	return { flags: rcloneFlags, password: secretAccessKey };
};

export const getDestinationCredentials = (destination: Destination) => {
	const type = destination.destinationType ?? "s3";
	if (type === "ftp") return { flags: getFTPCredentials(destination) };
	if (type === "sftp") return getSFTPCredentials(destination);
	return { flags: getS3Credentials(destination) };
};

// Returns the rclone remote path string for the given destination and sub-path
export const getDestinationPath = (
	destination: Destination,
	subPath: string,
) => {
	const type = destination.destinationType ?? "s3";
	const base = destination.bucket ? `${destination.bucket}/` : "";
	if (type === "ftp") return `:ftp:${base}${subPath}`;
	if (type === "sftp") return `:sftp:${base}${subPath}`;
	return `:s3:${destination.bucket}/${subPath}`;
};

// Builds the full rclone upload command, handling SFTP password obscuring
export const buildRcloneUploadCommand = (
	destination: Destination,
	remotePath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone rcat ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone rcat ${flags.join(" ")} "${remotePath}"`;
};

// Builds the rclone list command for a remote path
export const buildRcloneListCommand = (
	destination: Destination,
	remotePath: string,
	includePattern: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone lsf ${flags.join(" ")} --sftp-pass="$SFTP_PASS" --include "${includePattern}" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone lsf ${flags.join(" ")} --include "${includePattern}" "${remotePath}"`;
};

// Builds the rclone delete command for a remote path
export const buildRcloneDeleteCommand = (
	destination: Destination,
	remotePath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone delete ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone delete ${flags.join(" ")} "${remotePath}"`;
};

export const buildRcloneCopytoCommand = (
	destination: Destination,
	localPath: string,
	remotePath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone copyto ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${localPath}" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone copyto ${flags.join(" ")} "${localPath}" "${remotePath}"`;
};

// Builds the rclone copyto command for downloading a file from remote to local
export const buildRcloneDownloadCommand = (
	destination: Destination,
	remotePath: string,
	localPath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone copyto ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${remotePath}" "${localPath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone copyto ${flags.join(" ")} "${remotePath}" "${localPath}"`;
};

// Builds the rclone cat command for reading a file (used in restore)
export const buildRcloneCatCommand = (
	destination: Destination,
	remotePath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone cat ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone cat ${flags.join(" ")} "${remotePath}"`;
};

// Builds the rclone copy command for downloading a file (used in restore)
export const buildRcloneCopyCommand = (
	destination: Destination,
	remotePath: string,
) => {
	const type = destination.destinationType ?? "s3";
	if (type === "sftp") {
		const { flags, password } = getSFTPCredentials(destination);
		return `SFTP_PASS=$(rclone obscure "${password}") && rclone copy ${flags.join(" ")} --sftp-pass="$SFTP_PASS" "${remotePath}"`;
	}
	const { flags } = getDestinationCredentials(destination);
	return `rclone copy ${flags.join(" ")} "${remotePath}"`;
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

export const getLibsqlBackupCommand = (database: string) => {
	return `docker exec -i $CONTAINER_ID sh -c "tar cf - -C /var/lib/sqld ${database} | gzip"`;
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
	const {
		backupType,
		postgres,
		mysql,
		mariadb,
		mongo,
		libsql,
		compose,
		serviceName,
	} = backup;

	if (backupType === "database") {
		const appName =
			postgres?.appName ||
			mysql?.appName ||
			mariadb?.appName ||
			mongo?.appName ||
			libsql?.appName;
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
		case "libsql": {
			if (backupType === "database") {
				return getLibsqlBackupCommand(backup.database);
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
	echo "[$(date)] Starting upload to destination..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to destination failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to destination completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
