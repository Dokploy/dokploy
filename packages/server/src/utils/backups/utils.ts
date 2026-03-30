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

export const normalizeS3Path = (prefix: string) => {
	// Trim whitespace and remove leading/trailing slashes
	const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	// Return empty string if prefix is empty, otherwise append trailing slash
	return normalizedPrefix ? `${normalizedPrefix}/` : "";
};

/**
 * Escape a value for safe use inside a double-quoted shell string.
 * Escapes backslash, double-quote, dollar sign, and backtick.
 */
const escapeShellValue = (value: string): string =>
	value.replace(/[\\\"$`]/g, "\\$&");

export interface RcloneConfig {
	/** Shell preamble to set environment variables (for passwords) */
	preamble: string;
	/** Rclone command-line flags */
	flags: string[];
	/** Remote path for rclone (e.g., :s3:bucket or :sftp:/path) */
	remotePath: string;
}

const DEFAULT_SFTP_PORT = "22";
const DEFAULT_FTP_PORT = "21";

/**
 * Returns rclone configuration for the given destination.
 * Supports S3-compatible, SFTP, and FTP destination types.
 *
 * SECURITY: Passwords are passed via environment variables to prevent
 * shell injection attacks. The preamble should be prepended to any
 * shell command that uses these flags.
 */
export const getRcloneConfig = (destination: Destination): RcloneConfig => {
	const type = destination.destinationType ?? "s3";

	if (type === "sftp") {
		const preamble = destination.password
			? `export RCLONE_SFTP_PASS="$(rclone obscure '${destination.password.replace(/'/g, "'\\''")}')"; `
			: "";

		const flags = [
			`--sftp-host="${escapeShellValue(destination.host ?? "")}"`,
			`--sftp-port="${escapeShellValue(destination.port || DEFAULT_SFTP_PORT)}"`,
			`--sftp-user="${escapeShellValue(destination.username ?? "")}"`,
		];

		if (destination.password) {
			flags.push(`--sftp-pass="$RCLONE_SFTP_PASS"`);
		}

		const remotePath = `:sftp:${destination.remotePath ?? ""}`;

		return { preamble, flags, remotePath };
	}

	if (type === "ftp") {
		const preamble = destination.password
			? `export RCLONE_FTP_PASS="$(rclone obscure '${destination.password.replace(/'/g, "'\\''")}')"; `
			: "";

		const flags = [
			`--ftp-host="${escapeShellValue(destination.host ?? "")}"`,
			`--ftp-port="${escapeShellValue(destination.port || DEFAULT_FTP_PORT)}"`,
			`--ftp-user="${escapeShellValue(destination.username ?? "")}"`,
			"--ftp-disable-epsv",
		];

		if (destination.password) {
			flags.push(`--ftp-pass="$RCLONE_FTP_PASS"`);
		}

		const remotePath = `:ftp:${destination.remotePath ?? ""}`;

		return { preamble, flags, remotePath };
	}

	// Default: S3-compatible
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const flags = [
		`--s3-access-key-id="${escapeShellValue(accessKey ?? "")}"`,
		`--s3-secret-access-key="${escapeShellValue(secretAccessKey ?? "")}"`,
		`--s3-region="${escapeShellValue(region ?? "")}"`,
		`--s3-endpoint="${escapeShellValue(endpoint ?? "")}"`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		flags.unshift(`--s3-provider="${escapeShellValue(provider)}"`);
	}

	if (destination.additionalFlags?.length) {
		flags.push(...destination.additionalFlags);
	}

	const bucket = (destination.bucket ?? "").replace(/^\/+|\/+$/g, "");
	const remotePath = `:s3:${bucket}`;

	return { preamble: "", flags, remotePath };
};

/**
 * @deprecated Use getRcloneConfig instead for full support.
 * Returns only the flags array for backward compatibility.
 */
export const getS3Credentials = (destination: Destination): string[] => {
	return getRcloneConfig(destination).flags;
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
	echo "[$(date)] Starting upload to S3..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to S3 failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to S3 completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
