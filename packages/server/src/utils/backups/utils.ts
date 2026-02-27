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
 * Builds the rclone CLI flags for an S3-compatible destination.
 * Kept for backwards compatibility -- all existing callers that only
 * need S3 can continue to use this function unchanged.
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

/**
 * Generates an rclone configuration file snippet and the corresponding
 * remote path for any supported destination type.
 *
 * Returns { configContent, remotePath, configFlags } where:
 *  - configContent: the INI-style text for an rclone config file
 *  - remotePath:    the rclone remote:path string (e.g. "dokploy-remote:bucket/prefix")
 *  - configFlags:   array of CLI flags to pass to rclone (--config=...)
 *
 * For S3 destinations we keep the legacy inline-flag approach for backwards
 * compatibility. Non-S3 destinations use a temporary config file which is
 * written to disk before the rclone command runs.
 */
export const buildRcloneConfig = (
	destination: Destination,
): { configContent: string; remoteName: string } => {
	const remoteName = "dokploy-remote";
	const destType = destination.destinationType || "s3";

	switch (destType) {
		case "ftp": {
			const lines = [
				`[${remoteName}]`,
				"type = ftp",
				`host = ${destination.ftpHost || ""}`,
				`port = ${destination.ftpPort || "21"}`,
				`user = ${destination.ftpUser || ""}`,
				`pass = ${destination.ftpPassword || ""}`,
			];
			return { configContent: lines.join("\n"), remoteName };
		}
		case "sftp": {
			const lines = [
				`[${remoteName}]`,
				"type = sftp",
				`host = ${destination.ftpHost || ""}`,
				`port = ${destination.ftpPort || "22"}`,
				`user = ${destination.ftpUser || ""}`,
				`pass = ${destination.ftpPassword || ""}`,
			];
			return { configContent: lines.join("\n"), remoteName };
		}
		case "google-drive": {
			const tokenObj = destination.googleDriveToken || "{}";
			const lines = [
				`[${remoteName}]`,
				"type = drive",
				`client_id = ${destination.googleDriveClientId || ""}`,
				`client_secret = ${destination.googleDriveClientSecret || ""}`,
				`token = ${tokenObj}`,
				`root_folder_id = ${destination.googleDriveFolderId || ""}`,
			];
			return { configContent: lines.join("\n"), remoteName };
		}
		case "onedrive": {
			const tokenObj = destination.onedriveToken || "{}";
			const lines = [
				`[${remoteName}]`,
				"type = onedrive",
				`client_id = ${destination.onedriveClientId || ""}`,
				`client_secret = ${destination.onedriveClientSecret || ""}`,
				`token = ${tokenObj}`,
				`drive_id = ${destination.onedriveDriveId || ""}`,
			];
			return { configContent: lines.join("\n"), remoteName };
		}
		case "custom-rclone": {
			// User provides their own rclone config snippet.
			// We expect it to define a remote named "dokploy-remote" or
			// the first section found will be used.
			const raw = destination.rcloneConfig || `[${remoteName}]\ntype = local`;
			return { configContent: raw, remoteName };
		}
		default:
			// S3 - handled by legacy getS3Credentials
			return { configContent: "", remoteName };
	}
};

/**
 * Returns the remote path to use for rclone operations depending
 * on the destination type.  For S3, it returns `:s3:<bucket>/<path>`.
 * For other types, it returns `<remoteName>:<basePath>/<path>`.
 */
export const getRcloneRemotePath = (
	destination: Destination,
	subPath: string,
	remoteName = "dokploy-remote",
): string => {
	const destType = destination.destinationType || "s3";

	if (destType === "s3") {
		return `:s3:${destination.bucket}/${subPath}`;
	}

	// For Google Drive and OneDrive, the folder ID is already configured
	// in the rclone config, so we just use the remote with the subpath.
	if (destType === "google-drive") {
		return `${remoteName}:${subPath}`;
	}
	if (destType === "onedrive") {
		const folderId = destination.onedriveFolderId || "";
		const base = folderId ? `${folderId}/` : "";
		return `${remoteName}:${base}${subPath}`;
	}

	// FTP / SFTP / custom-rclone
	const basePath = destination.ftpBasePath || destination.rcloneRemotePath || "";
	const normalizedBase = basePath.replace(/\/+$/, "");
	return `${remoteName}:${normalizedBase ? `${normalizedBase}/` : ""}${subPath}`;
};

/**
 * Generates the rclone flags/arguments needed to perform a backup
 * or restore operation on any supported destination type.
 *
 * For S3, returns the classic inline flag approach.
 * For others, returns a shell snippet that writes a temp config
 * and references it via --config.
 */
export const getRcloneFlags = (destination: Destination): string[] => {
	const destType = destination.destinationType || "s3";

	if (destType === "s3") {
		return getS3Credentials(destination);
	}

	// Non-S3 destinations: return a config-based flag set.
	// The caller is responsible for writing the config file first.
	const { remoteName } = buildRcloneConfig(destination);
	return [`--config="/tmp/dokploy-rclone-${destination.destinationId}.conf"`];
};

/**
 * Returns a shell snippet that writes the rclone config to a temp file.
 * Must be executed before any rclone command for non-S3 destinations.
 */
export const getRcloneConfigSetupCommand = (destination: Destination): string => {
	const destType = destination.destinationType || "s3";

	if (destType === "s3") {
		return ""; // no setup needed for S3 inline flags
	}

	const { configContent } = buildRcloneConfig(destination);
	const configPath = `/tmp/dokploy-rclone-${destination.destinationId}.conf`;
	// Escape single quotes in the config content
	const escaped = configContent.replace(/'/g, "'\\''");
	return `cat > '${configPath}' << 'RCLONE_CONFIG_EOF'\n${escaped}\nRCLONE_CONFIG_EOF`;
};

/**
 * For rclone rcat (streaming backup), builds the full rclone command string.
 */
export const buildRcloneRcatCommand = (
	destination: Destination,
	remotePath: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone rcat ${flags.join(" ")} "${remotePath}"`;
};

/**
 * For rclone copyto (file-based backup), builds the full rclone command string.
 */
export const buildRcloneCopytoCommand = (
	destination: Destination,
	localPath: string,
	remotePath: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone copyto ${flags.join(" ")} "${localPath}" "${remotePath}"`;
};

/**
 * For rclone cat (streaming restore), builds the full rclone command string.
 */
export const buildRcloneCatCommand = (
	destination: Destination,
	remotePath: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone cat ${flags.join(" ")} "${remotePath}"`;
};

/**
 * For rclone copy (file-based restore, e.g. mongo), builds the full rclone command string.
 */
export const buildRcloneCopyCommand = (
	destination: Destination,
	remotePath: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone copy ${flags.join(" ")} "${remotePath}"`;
};

/**
 * For rclone lsjson (listing files), builds the full rclone command string.
 */
export const buildRcloneLsjsonCommand = (
	destination: Destination,
	remotePath: string,
	extraFlags: string[] = [],
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone lsjson ${flags.join(" ")} ${extraFlags.join(" ")} "${remotePath}" 2>/dev/null`;
};

/**
 * For rclone lsf (listing file names), builds the full rclone command string.
 */
export const buildRcloneLsfCommand = (
	destination: Destination,
	remotePath: string,
	includePattern: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone lsf ${flags.join(" ")} --include "${includePattern}" ${remotePath}`;
};

/**
 * For rclone delete, builds the full rclone command string.
 */
export const buildRcloneDeleteCommand = (
	destination: Destination,
	remotePath: string,
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone delete ${flags.join(" ")} ${remotePath}`;
};

/**
 * For rclone ls (connection test), builds the full rclone command string.
 */
export const buildRcloneLsCommand = (
	destination: Destination,
	remotePath: string,
	extraFlags: string[] = [],
): string => {
	const flags = getRcloneFlags(destination);
	return `rclone ls ${flags.join(" ")} ${extraFlags.join(" ")} "${remotePath}"`;
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
	const configSetup = getRcloneConfigSetupCommand(backup.destination);
	const destLabel =
		backup.destination.destinationType === "s3"
			? "S3"
			: backup.destination.destinationType?.toUpperCase() || "S3";

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
	${configSetup}
	echo "[$(date)] Starting backup process..." >> ${logPath};
	echo "[$(date)] Executing backup command..." >> ${logPath};
	CONTAINER_ID=$(${containerSearch})

	if [ -z "$CONTAINER_ID" ]; then
		echo "[$(date)] Error: Container not found" >> ${logPath};
		exit 1;
	fi

	echo "[$(date)] Container Up: $CONTAINER_ID" >> ${logPath};

	# Run the backup command and capture the exit status
	BACKUP_OUTPUT=$(${backupCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] Error: Backup failed" >> ${logPath};
		echo "Error: $BACKUP_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] backup completed successfully" >> ${logPath};
	echo "[$(date)] Starting upload to ${destLabel}..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] Error: Upload to ${destLabel} failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] Upload to ${destLabel} completed successfully" >> ${logPath};
	echo "Backup done" >> ${logPath};
	`;
};
