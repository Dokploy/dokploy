import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { quote } from "shell-quote";
import { keepLatestNBackups } from ".";
import { runComposeBackup } from "./compose";
import { runLibsqlBackup } from "./libsql";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { redactRcloneCredentials } from "./redact";
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
		`--s3-access-key-id=${quote([accessKey])}`,
		`--s3-secret-access-key=${quote([secretAccessKey])}`,
		`--s3-region=${quote([region])}`,
		`--s3-endpoint=${quote([endpoint])}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneFlags.unshift(`--s3-provider=${quote([provider])}`);
	}

	if (destination.additionalFlags?.length) {
		rcloneFlags.push(...destination.additionalFlags);
	}

	return rcloneFlags;
};

// User-controlled values (database name, user, password) are passed to the
// container as environment variables via `docker exec -e VAR=<escaped>` and
// referenced as "$VAR" inside the inner shell, so they never appear in the
// inner command text. The -e value is escaped for the outer shell with
// shell-quote; the inner script is single-quoted and reads the env vars.
export const getPostgresBackupCommand = (
	database: string,
	databaseUser: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -i $CONTAINER_ID bash -c 'set -o pipefail; pg_dump -Fc --no-acl --no-owner -h localhost -U "$DB_USER" --no-password "$DB_NAME" | gzip'`;
};

export const getMariadbBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID bash -c 'set -o pipefail; mariadb-dump --user="$DB_USER" --password="$DB_PASS" --single-transaction --quick --databases "$DB_NAME" | gzip'`;
};

export const getMysqlBackupCommand = (
	database: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID bash -c 'set -o pipefail; mysqldump --default-character-set=utf8mb4 -u root --password="$DB_PASS" --single-transaction --no-tablespaces --quick "$DB_NAME" | gzip'`;
};

export const getMongoBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -e DB_NAME=${quote([database])} -e DB_USER=${quote([databaseUser])} -e DB_PASS=${quote([databasePassword])} -i $CONTAINER_ID bash -c 'set -o pipefail; mongodump -d "$DB_NAME" -u "$DB_USER" -p "$DB_PASS" --archive --authenticationDatabase admin --gzip'`;
};

export const getLibsqlBackupCommand = (database: string) => {
	return `docker exec -e DB_NAME=${quote([database])} -i $CONTAINER_ID sh -c 'tar cf - -C /var/lib/sqld "$DB_NAME" | gzip'`;
};

export const getServiceContainerCommand = (appName: string) => {
	return `docker ps -q --no-trunc --filter "status=running" --filter "label=com.docker.swarm.service.name=${appName}" | head -n 1`;
};

export const getComposeContainerCommand = (
	appName: string,
	serviceName: string,
	composeType: "stack" | "docker-compose" | undefined,
) => {
	if (composeType === "stack") {
		return `docker ps -q --no-trunc --filter "status=running" --filter "label=com.docker.stack.namespace=${appName}" --filter "label=com.docker.swarm.service.name=${appName}_${serviceName}" | head -n 1`;
	}
	return `docker ps -q --no-trunc --filter "status=running" --filter "label=com.docker.compose.project=${appName}" --filter "label=com.docker.compose.service=${serviceName}" | head -n 1`;
};

export const getContainerSearchCommand = (backup: BackupSchedule) => {
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

export const BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE = 75;

export const getBackupCommand = (
	backup: BackupSchedule,
	rcloneFlags: string[],
	rcloneDestination: string,
	logPath: string,
	options: {
		containerId?: string;
		containerNotFoundExitCode?: number;
	} = {},
) => {
	const containerSearch = getContainerSearchCommand(backup);
	const backupCommand = generateBackupCommand(backup);
	const quotedRcloneDestination = quote([rcloneDestination]);
	const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} ${quotedRcloneDestination}`;
	const rcloneDeleteCommand = `rclone deletefile ${rcloneFlags.join(" ")} ${quotedRcloneDestination}`;
	const quotedLogPath = quote([logPath]);
	const containerId = options.containerId;
	const containerNotFoundExitCode = options.containerNotFoundExitCode ?? 1;
	const containerNotFoundMessage =
		containerNotFoundExitCode === BACKUP_WORKER_CONTAINER_NOT_FOUND_EXIT_CODE
			? "Database container moved before the backup started"
			: "❌ Error: Container not found";
	if (containerId && !/^[a-f0-9]{12,64}$/i.test(containerId)) {
		throw new Error("Invalid backup container ID");
	}
	if (
		!Number.isInteger(containerNotFoundExitCode) ||
		containerNotFoundExitCode < 1 ||
		containerNotFoundExitCode > 255
	) {
		throw new Error("Invalid container-not-found exit code");
	}
	// A Swarm task can restart while the helper image starts, so re-resolve the
	// original service locally if the captured task container is no longer running.
	const containerAssignment = containerId
		? `CONTAINER_ID=${quote([containerId])};
	if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_ID" 2>/dev/null)" != "true" ]; then
		CONTAINER_ID=$(${containerSearch});
	fi;`
		: `CONTAINER_ID=$(${containerSearch});`;

	logger.info(
		{
			containerSearch,
			rcloneCommand: redactRcloneCredentials(rcloneCommand),
			logPath,
		},
		`Executing backup command: ${backup.databaseType} ${backup.backupType}`,
	);

	return `
	set -eo pipefail;
	echo "[$(date)] Starting backup process..." >> ${quotedLogPath};
	echo "[$(date)] Executing backup command..." >> ${quotedLogPath};
	${containerAssignment}

	if [ -z "$CONTAINER_ID" ]; then
		echo "[$(date)] ${containerNotFoundMessage}" >> ${quotedLogPath};
		exit ${containerNotFoundExitCode};
	fi;

	echo "[$(date)] Container Up: $CONTAINER_ID" >> ${quotedLogPath};
	echo "[$(date)] Starting backup and upload to S3..." >> ${quotedLogPath};

	UPLOAD_OUTPUT=$({ ${backupCommand} | ${rcloneCommand}; } 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Backup failed" >> ${quotedLogPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${quotedLogPath};
		${rcloneDeleteCommand} >/dev/null 2>&1 || true;
		exit 1;
	};

	echo "[$(date)] ✅ Backup uploaded to S3 successfully" >> ${quotedLogPath};
	echo "Backup done ✅" >> ${quotedLogPath};
	`;
};
