import {
	isNonS3DestinationProvider,
	parseRcloneConfig,
	RCLONE_BACKEND_TYPE_REGEX,
} from "@dokploy/server/db/validations/destination";
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
import { RCLONE_SECRET_OPTION_REGEX, redactRcloneCredentials } from "./redact";
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

type RcloneDestination = Pick<
	Destination,
	| "name"
	| "provider"
	| "bucket"
	| "accessKey"
	| "secretAccessKey"
	| "region"
	| "endpoint"
	| "additionalFlags"
> & { rcloneConfig?: string | null };

export const getRcloneBackendType = (
	destination: RcloneDestination,
): string => {
	const provider = destination.provider?.trim().toLowerCase();
	if (!isNonS3DestinationProvider(provider) || provider === undefined) {
		return "s3";
	}
	if (provider !== "custom") {
		return provider;
	}
	const { config } = parseRcloneConfig(destination.rcloneConfig ?? "");
	const type = config.type?.trim().toLowerCase();
	if (!type || !RCLONE_BACKEND_TYPE_REGEX.test(type)) {
		throw new Error(
			`Invalid rclone backend type for destination "${destination.name}"`,
		);
	}
	return type;
};

const rcloneEnvVarName = (flagName: string): string =>
	`RCLONE_${flagName.toUpperCase().replaceAll("-", "_")}`;

const splitAdditionalFlags = (flags?: string[] | null) => {
	const plain: string[] = [];
	const env: Record<string, string> = {};
	for (const flag of flags ?? []) {
		const separator = flag.indexOf("=");
		const name = flag.slice(2, separator === -1 ? undefined : separator);
		if (separator !== -1 && RCLONE_SECRET_OPTION_REGEX.test(name)) {
			env[rcloneEnvVarName(name)] = flag.slice(separator + 1);
		} else {
			plain.push(flag);
		}
	}
	return { plain, env };
};

const getParsedRcloneConfig = (destination: RcloneDestination) => {
	const { config, error } = parseRcloneConfig(destination.rcloneConfig ?? "");
	if (error) {
		throw new Error(
			`Invalid rclone config for destination "${destination.name}": ${error}`,
		);
	}
	return config;
};

const rcloneFlagName = (backend: string, key: string) =>
	`${backend}-${key.replaceAll("_", "-")}`;

// Only non-secret options belong on the command line; credentials are routed
// through getRcloneEnv so they never appear in logged commands or error text.
export const getRcloneFlags = (destination: RcloneDestination): string[] => {
	const { plain } = splitAdditionalFlags(destination.additionalFlags);
	if (!isNonS3DestinationProvider(destination.provider)) {
		return [...getS3Credentials(destination), ...plain];
	}
	const backend = getRcloneBackendType(destination);
	const config = getParsedRcloneConfig(destination);
	return [
		...Object.entries(config)
			.filter(([key]) => key !== "type")
			.filter(
				([key]) =>
					!RCLONE_SECRET_OPTION_REGEX.test(rcloneFlagName(backend, key)),
			)
			.map(
				([key, value]) => `--${rcloneFlagName(backend, key)}=${quote([value])}`,
			),
		...plain,
	];
};

// Credential options become RCLONE_<BACKEND>_<OPTION> env vars, which rclone
// reads exactly like the matching flag but keeps off the command line.
export const getRcloneEnv = (
	destination: RcloneDestination,
): Record<string, string> => {
	const { env: additional } = splitAdditionalFlags(destination.additionalFlags);
	if (!isNonS3DestinationProvider(destination.provider)) {
		return {
			RCLONE_S3_ACCESS_KEY_ID: destination.accessKey,
			RCLONE_S3_SECRET_ACCESS_KEY: destination.secretAccessKey,
			...additional,
		};
	}
	const backend = getRcloneBackendType(destination);
	const config = getParsedRcloneConfig(destination);
	const env: Record<string, string> = { ...additional };
	for (const [key, value] of Object.entries(config)) {
		if (key === "type") continue;
		const flagName = rcloneFlagName(backend, key);
		if (RCLONE_SECRET_OPTION_REGEX.test(flagName)) {
			env[rcloneEnvVarName(flagName)] = value;
		}
	}
	return env;
};

export const getRcloneRemotePath = (
	destination: RcloneDestination,
	remotePath = "",
): string => {
	const backend = getRcloneBackendType(destination);
	const remote =
		backend === "s3"
			? `:s3:${destination.bucket}`
			: `:${backend}:${(destination.bucket ?? "").trim().replace(/\/+$/, "")}`;
	if (!remotePath) {
		return remote;
	}
	return remote.endsWith(":")
		? `${remote}${remotePath}`
		: `${remote}/${remotePath}`;
};

// Non-secret S3 options only; the access key pair goes through getRcloneEnv.
export const getS3Credentials = (destination: RcloneDestination) => {
	const { region, endpoint, provider } = destination;
	const rcloneFlags = [
		`--s3-region=${quote([region])}`,
		`--s3-endpoint=${quote([endpoint])}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneFlags.unshift(`--s3-provider=${quote([provider])}`);
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
	rcloneFlags: string[],
	rcloneDestination: string,
	logPath: string,
) => {
	const containerSearch = getContainerSearchCommand(backup);
	const backupCommand = generateBackupCommand(backup);
	const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
	const rcloneDeleteCommand = `rclone deletefile ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

	logger.info(
		{
			containerSearch,
			backupCommand,
			rcloneCommand: redactRcloneCredentials(rcloneCommand),
			logPath,
		},
		`Executing backup command: ${backup.databaseType} ${backup.backupType}`,
	);

	return `
	set -eo pipefail;
	echo "[$(date)] Starting backup process..." >> ${logPath};
	echo "[$(date)] Executing backup command..." >> ${logPath};
	CONTAINER_ID=$(${containerSearch});

	if [ -z "$CONTAINER_ID" ]; then
		echo "[$(date)] ❌ Error: Container not found" >> ${logPath};
		exit 1;
	fi;

	echo "[$(date)] Container Up: $CONTAINER_ID" >> ${logPath};
	echo "[$(date)] Starting backup and upload to destination..." >> ${logPath};

	UPLOAD_OUTPUT=$({ ${backupCommand} | ${rcloneCommand}; } 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Backup failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		${rcloneDeleteCommand} >/dev/null 2>&1 || true;
		exit 1;
	};

	echo "[$(date)] ✅ Backup uploaded to destination successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
