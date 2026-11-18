import {
	CLEANUP_CRON_JOB,
	cleanupAll,
	findBackupById,
	findScheduleById,
	findServerById,
	findVolumeBackupById,
	getVolumeBackupServerId,
	keepLatestNBackups,
	runCommand,
	runComposeBackup,
	runLibsqlBackup,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
	runVolumeBackup,
} from "@dokploy/server";
import {
	and,
	backups,
	db,
	eq,
	schedules,
	server,
	volumeBackups,
} from "@dokploy/server/db";
import { logger } from "./logger.js";
import { scheduleJob } from "./queue.js";
import type { QueueJob } from "./schema.js";

// Same check the backup branch makes inline: a server can be deactivated after
// its jobs were scheduled.
const isServerInactive = async (serverId: string | null | undefined) => {
	if (!serverId) {
		return false;
	}
	const { serverStatus } = await findServerById(serverId);
	if (serverStatus === "inactive") {
		logger.info("Server is inactive");
		return true;
	}
	return false;
};

export const runJobs = async (job: QueueJob) => {
	try {
		if (job.type === "backup") {
			const { backupId } = job;
			const backup = await findBackupById(backupId);
			if (!backup.enabled) {
				logger.info("Backup is disabled");
				return;
			}
			const {
				databaseType,
				postgres,
				mysql,
				mongo,
				mariadb,
				libsql,
				compose,
				backupType,
			} = backup;

			if (backupType === "database") {
				if (databaseType === "postgres" && postgres) {
					const server = await findServerById(postgres.serverId as string);
					if (server.serverStatus === "inactive") {
						logger.info("Server is inactive");
						return;
					}
					await runPostgresBackup(postgres, backup);
					await keepLatestNBackups(backup, server.serverId);
				} else if (databaseType === "mysql" && mysql) {
					const server = await findServerById(mysql.serverId as string);
					if (server.serverStatus === "inactive") {
						logger.info("Server is inactive");
						return;
					}
					await runMySqlBackup(mysql, backup);
					await keepLatestNBackups(backup, server.serverId);
				} else if (databaseType === "mongo" && mongo) {
					const server = await findServerById(mongo.serverId as string);
					if (server.serverStatus === "inactive") {
						logger.info("Server is inactive");
						return;
					}
					await runMongoBackup(mongo, backup);
					await keepLatestNBackups(backup, server.serverId);
				} else if (databaseType === "mariadb" && mariadb) {
					const server = await findServerById(mariadb.serverId as string);
					if (server.serverStatus === "inactive") {
						logger.info("Server is inactive");
						return;
					}
					await runMariadbBackup(mariadb, backup);
					await keepLatestNBackups(backup, server.serverId);
				} else if (databaseType === "libsql" && libsql) {
					const server = await findServerById(libsql.serverId as string);
					if (server.serverStatus === "inactive") {
						logger.info("Server is inactive");
						return;
					}
					await runLibsqlBackup(libsql, backup);
					await keepLatestNBackups(backup, server.serverId);
				}
			} else if (backupType === "compose" && compose) {
				const server = await findServerById(compose.serverId as string);
				if (server.serverStatus === "inactive") {
					logger.info("Server is inactive");
					return;
				}
				await runComposeBackup(compose, backup);
				await keepLatestNBackups(backup, server.serverId);
			}
		} else if (job.type === "server") {
			const { serverId } = job;
			const server = await findServerById(serverId);
			if (server.serverStatus === "inactive") {
				logger.info("Server is inactive");
				return;
			}
			await cleanupAll(serverId);
		} else if (job.type === "schedule") {
			const { scheduleId } = job;
			const schedule = await findScheduleById(scheduleId);
			const serverId =
				schedule.serverId ??
				schedule.application?.serverId ??
				schedule.compose?.serverId;
			if (schedule.enabled && !(await isServerInactive(serverId))) {
				await runCommand(schedule.scheduleId);
			}
		} else if (job.type === "volume-backup") {
			const { volumeBackupId } = job;
			const volumeBackup = await findVolumeBackupById(volumeBackupId);
			if (
				volumeBackup.enabled &&
				!(await isServerInactive(getVolumeBackupServerId(volumeBackup)))
			) {
				await runVolumeBackup(volumeBackupId);
			}
		}
	} catch (error) {
		logger.error(error);
	}

	return true;
};

export const initializeJobs = async () => {
	logger.info("Setting up Jobs....");

	const servers = await db.query.server.findMany({
		where: and(
			eq(server.enableDockerCleanup, true),
			eq(server.serverStatus, "active"),
		),
	});

	for (const server of servers) {
		const { serverId } = server;
		try {
			await scheduleJob({
				serverId,
				type: "server",
				cronSchedule: CLEANUP_CRON_JOB,
			});
		} catch (error) {
			logger.error(
				error,
				`Failed to schedule cleanup job for server ${serverId}`,
			);
		}
	}

	logger.info({ Quantity: servers.length }, "Active Servers Initialized");

	const backupsResult = await db.query.backups.findMany({
		where: eq(backups.enabled, true),
		with: {
			mariadb: true,
			mysql: true,
			postgres: true,
			mongo: true,
			libsql: true,
			compose: true,
		},
	});

	for (const backup of backupsResult) {
		try {
			await scheduleJob({
				backupId: backup.backupId,
				type: "backup",
				cronSchedule: backup.schedule,
			});
		} catch (error) {
			logger.error(error, `Failed to schedule backup ${backup.backupId}`);
		}
	}
	logger.info({ Quantity: backupsResult.length }, "Backups Initialized");

	const schedulesResult = await db.query.schedules.findMany({
		where: eq(schedules.enabled, true),
		with: {
			application: {
				columns: {
					applicationId: true,
				},
				with: {
					server: true,
				},
			},
			compose: {
				with: {
					server: true,
				},
			},
			server: true,
		},
	});

	const filteredSchedulesBasedOnServerStatus = schedulesResult.filter(
		(schedule) => {
			if (schedule.server) {
				return schedule.server.serverStatus === "active";
			}
			if (schedule.application) {
				return schedule.application.server?.serverStatus === "active";
			}
			if (schedule.compose) {
				return schedule.compose.server?.serverStatus === "active";
			}
			return false;
		},
	);

	for (const schedule of filteredSchedulesBasedOnServerStatus) {
		try {
			await scheduleJob({
				scheduleId: schedule.scheduleId,
				type: "schedule",
				cronSchedule: schedule.cronExpression,
				timezone: schedule.timezone,
			});
		} catch (error) {
			logger.error(error, `Failed to schedule ${schedule.scheduleId}`);
		}
	}
	logger.info(
		{ Quantity: filteredSchedulesBasedOnServerStatus.length },
		"Schedules Initialized",
	);

	const withServer = { with: { server: true } } as const;
	const volumeBackupsResult = await db.query.volumeBackups.findMany({
		where: eq(volumeBackups.enabled, true),
		with: {
			application: {
				columns: {
					applicationId: true,
				},
				with: {
					server: true,
				},
			},
			compose: withServer,
			postgres: withServer,
			mysql: withServer,
			mariadb: withServer,
			mongo: withServer,
			redis: withServer,
			libsql: withServer,
		},
	});

	const filteredVolumeBackupsBasedOnServerStatus = volumeBackupsResult.filter(
		(volumeBackup) => {
			const service =
				volumeBackup.application ??
				volumeBackup.compose ??
				volumeBackup.postgres ??
				volumeBackup.mysql ??
				volumeBackup.mariadb ??
				volumeBackup.mongo ??
				volumeBackup.redis ??
				volumeBackup.libsql;
			return service?.server?.serverStatus === "active";
		},
	);

	for (const volumeBackup of filteredVolumeBackupsBasedOnServerStatus) {
		try {
			await scheduleJob({
				volumeBackupId: volumeBackup.volumeBackupId,
				type: "volume-backup",
				cronSchedule: volumeBackup.cronExpression,
			});
		} catch (error) {
			logger.error(
				error,
				`Failed to schedule volume backup ${volumeBackup.volumeBackupId}`,
			);
		}
	}

	logger.info(
		{ Quantity: filteredVolumeBackupsBasedOnServerStatus.length },
		"Volume Backups Initialized",
	);
};
