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
	const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	return normalizedPrefix ? `${normalizedPrefix}/` : "";
};

export const getS3Credentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const rcloneFlags = [
		`--s3-access-key-id=${accessKey}`,
		`--s3-secret-access-key=${secretAccessKey}`,
		`--s3-region=${region}`,
		`--s3-endpoint=${endpoint}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];
	if (provider) {
		rcloneFlags.unshift(`--s3-provider=${provider}`);
	}
	return rcloneFlags;
};

// Masks sensitive values in commands and connection strings before logging
export const maskSensitive = (text: string) => {
	if (!text) return text;
	let out = text;
	// Rclone S3 flags
	out = out.replace(
		/--s3-access-key-id=("[^"]+"|'[^']+'|[^ \n]+)/g,
		"--s3-access-key-id=****",
	);
	out = out.replace(
		/--s3-secret-access-key=("[^"]+"|'[^']+'|[^ \n]+)/g,
		"--s3-secret-access-key=****",
	);
	// Connection string style used in UI or elsewhere
	out = out.replace(
		/access_key_id=("[^"]+"|'[^']+'|[^, \n:]+)/g,
		"access_key_id=****",
	);
	out = out.replace(
		/secret_access_key=("[^"]+"|'[^']+'|[^, \n:]+)/g,
		"secret_access_key=****",
	);
	// Common DB password flags
	out = out.replace(
		/--password(=|\s+)("[^"]+"|'[^']+'|[^ \n]+)/g,
		"--password=****",
	);
	// Short -p forms (with or without space/quotes)
	out = out.replace(/\s-p\s+("[^"]+"|'[^']+'|[^ \n]+)/g, " -p ****");
	out = out.replace(/\s-p[^\s]*/g, " -p****");
	return out;
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
	return `docker exec -i $CONTAINER_ID bash -c "set -o pipefail; mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip"`;
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
	switch (backup.databaseType) {
		case "postgres": {
			const postgres = backup.postgres;
			if (backup.backupType === "database" && postgres) {
				return getPostgresBackupCommand(backup.database, postgres.databaseUser);
			}
			if (backup.backupType === "compose" && backup.metadata?.postgres) {
				return getPostgresBackupCommand(
					backup.database,
					backup.metadata.postgres.databaseUser,
				);
			}
			break;
		}
		case "mysql": {
			const mysql = backup.mysql;
			if (backup.backupType === "database" && mysql) {
				return getMysqlBackupCommand(
					backup.database,
					mysql.databaseRootPassword,
				);
			}
			if (backup.backupType === "compose" && backup.metadata?.mysql) {
				return getMysqlBackupCommand(
					backup.database,
					backup.metadata?.mysql?.databaseRootPassword || "",
				);
			}
			break;
		}
		case "mariadb": {
			const mariadb = backup.mariadb;
			if (backup.backupType === "database" && mariadb) {
				return getMariadbBackupCommand(
					backup.database,
					mariadb.databaseUser,
					mariadb.databasePassword,
				);
			}
			if (backup.backupType === "compose" && backup.metadata?.mariadb) {
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
			if (backup.backupType === "database" && mongo) {
				return getMongoBackupCommand(
					backup.database,
					mongo.databaseUser,
					mongo.databasePassword,
				);
			}
			if (backup.backupType === "compose" && backup.metadata?.mongo) {
				return getMongoBackupCommand(
					backup.database,
					backup.metadata.mongo.databaseUser,
					backup.metadata.mongo.databasePassword,
				);
			}
			break;
		}
		default:
			throw new Error(`Database type not supported: ${backup.databaseType}`);
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
			backupCommand: maskSensitive(backupCommand || ""),
			rcloneCommand: maskSensitive(rcloneCommand),
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
