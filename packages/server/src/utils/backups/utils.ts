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
	return normalizeRclonePath(prefix);
};

export const RCLONE_DESTINATION_PROVIDERS = [
	"ftp",
	"sftp",
	"drive",
	"onedrive",
] as const;

export type RcloneDestinationProvider =
	| "s3"
	| (typeof RCLONE_DESTINATION_PROVIDERS)[number];

const RCLONE_PROVIDER_SET = new Set<string>(RCLONE_DESTINATION_PROVIDERS);

export const shellQuote = (value: string) =>
	`'${value.replace(/'/g, "'\\''")}'`;

export const normalizeRclonePath = (
	prefix: string,
	options?: { preserveLeadingSlash?: boolean },
) => {
	const trimmed = prefix.trim();
	const hasLeadingSlash =
		options?.preserveLeadingSlash === true && trimmed.startsWith("/");
	const normalizedPrefix = trimmed.replace(/^\/+|\/+$/g, "");
	if (!normalizedPrefix) {
		return hasLeadingSlash ? "/" : "";
	}
	return `${hasLeadingSlash ? "/" : ""}${normalizedPrefix}/`;
};

export const getRcloneDestinationProvider = (
	destination: Pick<Destination, "provider">,
): RcloneDestinationProvider => {
	const provider = destination.provider?.trim().toLowerCase();
	if (provider && RCLONE_PROVIDER_SET.has(provider)) {
		return provider as RcloneDestinationProvider;
	}
	return "s3";
};

const joinRclonePath = (
	basePath: string,
	path = "",
	options?: { preserveLeadingSlash?: boolean },
) => {
	const normalizedBase = normalizeRclonePath(basePath, options);
	const normalizedPath = path.trim().replace(/^\/+/, "");
	if (!normalizedPath) {
		return normalizedBase === "/"
			? normalizedBase
			: normalizedBase.slice(0, -1);
	}
	return `${normalizedBase}${normalizedPath}`;
};

export const getRcloneDestination = (destination: Destination, path = "") => {
	const provider = getRcloneDestinationProvider(destination);
	const basePath = destination.bucket || "";
	const remotePath = joinRclonePath(basePath, path, {
		preserveLeadingSlash: provider === "ftp" || provider === "sftp",
	});

	return `:${provider}:${remotePath}`;
};

const getOptionalFlag = (flag: string, value?: string | null) => {
	const trimmedValue = value?.trim();
	return trimmedValue ? [`${flag}=${shellQuote(trimmedValue)}`] : [];
};

const getObscuredPasswordFlag = (flag: string, value: string) =>
	`${flag}=$(rclone obscure ${shellQuote(value)})`;

export const getRcloneFlags = (destination: Destination) => {
	const providerType = getRcloneDestinationProvider(destination);
	const { accessKey, secretAccessKey, region, endpoint, provider } =
		destination;
	let rcloneFlags: string[] = [];

	if (providerType === "s3") {
		rcloneFlags = [
			...getOptionalFlag("--s3-provider", provider),
			`--s3-access-key-id=${shellQuote(accessKey)}`,
			`--s3-secret-access-key=${shellQuote(secretAccessKey)}`,
			`--s3-region=${shellQuote(region)}`,
			`--s3-endpoint=${shellQuote(endpoint)}`,
			"--s3-no-check-bucket",
			"--s3-force-path-style",
		];
	} else if (providerType === "ftp") {
		rcloneFlags = [
			`--ftp-host=${shellQuote(endpoint)}`,
			`--ftp-user=${shellQuote(accessKey)}`,
			...getOptionalFlag("--ftp-port", region),
			getObscuredPasswordFlag("--ftp-pass", secretAccessKey),
		];
	} else if (providerType === "sftp") {
		rcloneFlags = [
			`--sftp-host=${shellQuote(endpoint)}`,
			`--sftp-user=${shellQuote(accessKey)}`,
			...getOptionalFlag("--sftp-port", region),
			getObscuredPasswordFlag("--sftp-pass", secretAccessKey),
		];
	} else if (providerType === "drive") {
		rcloneFlags = [
			...getOptionalFlag("--drive-client-id", accessKey),
			...getOptionalFlag("--drive-client-secret", secretAccessKey),
			`--drive-token=${shellQuote(endpoint)}`,
			...getOptionalFlag("--drive-root-folder-id", region),
		];
	} else if (providerType === "onedrive") {
		rcloneFlags = [
			...getOptionalFlag("--onedrive-client-id", accessKey),
			...getOptionalFlag("--onedrive-client-secret", secretAccessKey),
			`--onedrive-token=${shellQuote(endpoint)}`,
			...getOptionalFlag("--onedrive-drive-id", region),
		];
	}

	if (destination.additionalFlags?.length) {
		rcloneFlags.push(...destination.additionalFlags);
	}

	return rcloneFlags;
};

export const getRcloneTestFlags = (destination: Destination) => [
	...getRcloneFlags(destination),
	"--retries 1",
	"--low-level-retries 1",
	"--timeout 10s",
	"--contimeout 5s",
];

export const getS3Credentials = (destination: Destination) =>
	getRcloneFlags(destination);

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
	echo "[$(date)] Starting upload to backup destination..." >> ${logPath};

	# Run the upload command and capture the exit status
	UPLOAD_OUTPUT=$(${backupCommand} | ${rcloneCommand} 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Upload to backup destination failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		exit 1;
	}

	echo "[$(date)] ✅ Upload to backup destination completed successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;
};
