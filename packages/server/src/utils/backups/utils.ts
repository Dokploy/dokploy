import { assertRcloneAdditionalFlagsAllowed } from "@dokploy/server/db/validations/destination";
import { logger } from "@dokploy/server/lib/logger";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import {
	assertDestinationEndpointAllowed,
	normalizeDestinationEndpointUrl,
} from "@dokploy/server/utils/destination/endpoint";
import {
	normalizeRestoreDatabaseName,
	normalizeRestoreServiceName,
	quoteRestoreShellArg,
} from "@dokploy/server/utils/restore/safe-input";
import { redactSensitiveText } from "@dokploy/server/utils/security/redaction";
import {
	quoteShellArgs,
	quoteShellArgument,
} from "@dokploy/server/utils/shell";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { keepLatestNBackups } from ".";
import { runComposeBackup } from "./compose";
import { isBackupScheduleTargetBound } from "./invariant";
import { runLibsqlBackup } from "./libsql";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { redactRcloneCredentials } from "./redact";
import { runWebServerBackup } from "./web-server";

export const scheduleBackup = (backup: BackupSchedule) => {
	if (!isBackupScheduleTargetBound(backup)) {
		logger.warn(
			{
				backupId: backup.backupId,
				backupType: backup.backupType,
				databaseType: backup.databaseType,
			},
			"Skipping backup schedule with mismatched service binding",
		);
		return;
	}

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

export const shouldRunBackupRetention = (keepLatestCount?: number | null) =>
	Number.isInteger(keepLatestCount) && (keepLatestCount ?? 0) > 0;

export type RcloneS3Destination = Pick<
	Destination,
	| "accessKey"
	| "secretAccessKey"
	| "region"
	| "endpoint"
	| "provider"
	| "additionalFlags"
	| "bucket"
>;

const RCLONE_S3_REMOTE_NAME = "dokploys3";

export const getS3CredentialArgs = (destination: RcloneS3Destination) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const normalizedEndpoint = normalizeDestinationEndpointUrl(endpoint, {
		fieldName: "S3 endpoint",
	});
	const rcloneArgs = [
		"--s3-access-key-id",
		accessKey,
		"--s3-secret-access-key",
		secretAccessKey,
		"--s3-region",
		region,
		"--s3-endpoint",
		normalizedEndpoint,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneArgs.unshift("--s3-provider", provider);
	}

	if (destination.additionalFlags?.length) {
		assertRcloneAdditionalFlagsAllowed(destination.additionalFlags);
		rcloneArgs.push(...destination.additionalFlags);
	}

	return rcloneArgs;
};

export const getS3Credentials = (destination: RcloneS3Destination) =>
	getS3CredentialArgs(destination).map((arg) => quoteShellArgument(arg));

export const getRcloneS3Destination = (
	destination: Pick<RcloneS3Destination, "bucket">,
	path?: string,
) => `${RCLONE_S3_REMOTE_NAME}:${destination.bucket}${path ? `/${path}` : ""}`;

export const buildRcloneCommand = (args: readonly string[]) =>
	quoteShellArgs(["rclone", ...args]);

const getRcloneS3EnvironmentAssignments = (
	destination: RcloneS3Destination,
) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	const normalizedEndpoint = normalizeDestinationEndpointUrl(endpoint, {
		fieldName: "S3 endpoint",
	});
	const configPrefix = `RCLONE_CONFIG_${RCLONE_S3_REMOTE_NAME.toUpperCase()}`;
	const assignments: Array<[string, string]> = [
		[`${configPrefix}_TYPE`, "s3"],
		[`${configPrefix}_ACCESS_KEY_ID`, accessKey],
		[`${configPrefix}_SECRET_ACCESS_KEY`, secretAccessKey],
		[`${configPrefix}_REGION`, region],
		[`${configPrefix}_ENDPOINT`, normalizedEndpoint],
		[`${configPrefix}_NO_CHECK_BUCKET`, "true"],
		[`${configPrefix}_FORCE_PATH_STYLE`, "true"],
	];

	if (provider) {
		assignments.push([`${configPrefix}_PROVIDER`, provider]);
	}

	return assignments.map(
		([key, value]) => `${key}=${quoteShellArgument(value)}`,
	);
};

export const getS3RuntimeArgs = (destination: RcloneS3Destination) => {
	assertRcloneAdditionalFlagsAllowed(destination.additionalFlags);
	return destination.additionalFlags ?? [];
};

export const buildRcloneS3Command = (
	command: string,
	destination: RcloneS3Destination,
	args: readonly string[],
) =>
	[
		...getRcloneS3EnvironmentAssignments(destination),
		buildRcloneCommand([command, ...getS3RuntimeArgs(destination), ...args]),
	].join(" ");

export const buildRcloneS3DeleteXargsCommand = (
	destination: RcloneS3Destination,
	pathPrefix: string,
) =>
	[
		...getRcloneS3EnvironmentAssignments(destination),
		`${buildRcloneCommand(["delete", ...getS3RuntimeArgs(destination)])} ${quoteShellArgument(pathPrefix)}"$1"`,
	].join(" ");

export const assertRcloneS3DestinationAllowed = async (
	destination: RcloneS3Destination,
) => {
	assertRcloneAdditionalFlagsAllowed(destination.additionalFlags);
	const endpoint = await assertDestinationEndpointAllowed(
		destination.endpoint,
		{
			fieldName: "S3 endpoint",
		},
	);

	return {
		...destination,
		endpoint,
	};
};

export const getPostgresBackupCommand = (
	database: string,
	databaseUser: string,
) => {
	const safeDatabase = normalizeRestoreDatabaseName(database);
	const innerCommand = `set -o pipefail; pg_dump -Fc --no-acl --no-owner -h localhost -U ${quoteRestoreShellArg(databaseUser)} --no-password ${quoteRestoreShellArg(safeDatabase)} | gzip`;
	return `docker exec -i "$CONTAINER_ID" bash -c ${quoteRestoreShellArg(innerCommand)}`;
};

export const getMariadbBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	const safeDatabase = normalizeRestoreDatabaseName(database);
	const innerCommand = `set -o pipefail; mariadb-dump --user=${quoteRestoreShellArg(databaseUser)} --password=${quoteRestoreShellArg(databasePassword)} --single-transaction --quick --databases ${quoteRestoreShellArg(safeDatabase)} | gzip`;
	return `docker exec -i "$CONTAINER_ID" bash -c ${quoteRestoreShellArg(innerCommand)}`;
};

export const getMysqlBackupCommand = (
	database: string,
	databasePassword: string,
) => {
	const safeDatabase = normalizeRestoreDatabaseName(database);
	const innerCommand = `set -o pipefail; mysqldump --default-character-set=utf8mb4 -u root --password=${quoteRestoreShellArg(databasePassword)} --single-transaction --no-tablespaces --quick ${quoteRestoreShellArg(safeDatabase)} | gzip`;
	return `docker exec -i "$CONTAINER_ID" bash -c ${quoteRestoreShellArg(innerCommand)}`;
};

export const getMongoBackupCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	const safeDatabase = normalizeRestoreDatabaseName(database);
	const innerCommand = `set -o pipefail; mongodump -d ${quoteRestoreShellArg(safeDatabase)} -u ${quoteRestoreShellArg(databaseUser)} -p ${quoteRestoreShellArg(databasePassword)} --archive --authenticationDatabase admin --gzip`;
	return `docker exec -i "$CONTAINER_ID" bash -c ${quoteRestoreShellArg(innerCommand)}`;
};

export const getLibsqlBackupCommand = (database: string) => {
	const safeDatabase = normalizeRestoreDatabaseName(database);
	const innerCommand = `tar cf - -C /var/lib/sqld ${quoteRestoreShellArg(safeDatabase)} | gzip`;
	return `docker exec -i "$CONTAINER_ID" sh -c ${quoteRestoreShellArg(innerCommand)}`;
};

export const getServiceContainerCommand = (appName: string) => {
	const safeAppName = normalizeRestoreServiceName(appName);
	if (!safeAppName) {
		throw new Error("Invalid service name");
	}
	return `${quoteShellArgs([
		"docker",
		"ps",
		"-q",
		"--filter",
		"status=running",
		"--filter",
		`label=com.docker.swarm.service.name=${safeAppName}`,
	])} | head -n 1`;
};

export const getComposeContainerCommand = (
	appName: string,
	serviceName: string,
	composeType: "stack" | "docker-compose" | undefined,
) => {
	const safeAppName = normalizeRestoreServiceName(appName);
	const safeServiceName = normalizeRestoreServiceName(serviceName);
	if (!safeAppName || !safeServiceName) {
		throw new Error("Invalid service name");
	}
	if (composeType === "stack") {
		return `${quoteShellArgs([
			"docker",
			"ps",
			"-q",
			"--filter",
			"status=running",
			"--filter",
			`label=com.docker.stack.namespace=${safeAppName}`,
			"--filter",
			`label=com.docker.swarm.service.name=${safeAppName}_${safeServiceName}`,
		])} | head -n 1`;
	}
	return `${quoteShellArgs([
		"docker",
		"ps",
		"-q",
		"--filter",
		"status=running",
		"--filter",
		`label=com.docker.compose.project=${safeAppName}`,
		"--filter",
		`label=com.docker.compose.service=${safeServiceName}`,
	])} | head -n 1`;
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
	if (!isBackupScheduleTargetBound(backup)) {
		throw new Error("Backup schedule target is not linked to its backup type.");
	}

	const containerSearch = getContainerSearchCommand(backup);
	const backupCommand = generateBackupCommand(backup);

	if (!containerSearch || !backupCommand) {
		throw new Error("Backup command could not be generated.");
	}

	logger.info(
		{
			containerSearch,
			backupCommand: redactSensitiveText(backupCommand),
			rcloneCommand: redactSensitiveText(
				redactRcloneCredentials(rcloneCommand),
			),
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
		echo "Error: Backup command failed. Check server logs for details." >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ backup completed successfully" >> ${logPath};
	echo "[$(date)] Starting upload to S3..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to S3 failed" >> ${logPath};
		echo "Error: Upload command failed. Check server logs for details." >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to S3 completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
