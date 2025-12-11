import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	findBackupById,
	findScheduleById,
	findServerById,
	findVolumeBackupById,
	keepLatestNBackups,
	runCommand,
	runComposeBackup,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
	runVolumeBackup,
} from "@dokploy/server";
import { db } from "@dokploy/server/dist/db";
import {
	backups,
	schedules,
	server,
	volumeBackups,
} from "@dokploy/server/dist/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger.js";
import { scheduleJob } from "./queue.js";
import type { QueueJob } from "./schema.js";

export const runJobs = async (job: QueueJob) => {
	try {
		if (job.type === "backup") {
			const { backupId } = job;
			const backup = await findBackupById(backupId);
			const {
				databaseType,
				postgres,
				mysql,
				mongo,
				mariadb,
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
				}
			} else if (backupType === "compose" && compose) {
				const server = await findServerById(compose.serverId as string);
				if (server.serverStatus === "inactive") {
					logger.info("Server is inactive");
					return;
				}
				await runComposeBackup(compose, backup);
			}
		} else if (job.type === "server") {
			const { serverId } = job;
			const server = await findServerById(serverId);
			if (server.serverStatus === "inactive") {
				logger.info("Server is inactive");
				return;
			}
			await cleanUpUnusedImages(serverId);
			await cleanUpDockerBuilder(serverId);
			await cleanUpSystemPrune(serverId);
		} else if (job.type === "schedule") {
			const { scheduleId } = job;
			const schedule = await findScheduleById(scheduleId);
			if (schedule.enabled) {
				await runCommand(schedule.scheduleId);
			}
		} else if (job.type === "volume-backup") {
			const { volumeBackupId } = job;
			const volumeBackup = await findVolumeBackupById(volumeBackupId);
			if (volumeBackup.enabled) {
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
		scheduleJob({
			serverId,
			type: "server",
			cronSchedule: "0 0 * * *",
		});
	}

	logger.info({ Quantity: servers.length }, "Active Servers Initialized");

	const backupsResult = await db.query.backups.findMany({
		where: eq(backups.enabled, true),
		with: {
			mariadb: true,
			mysql: true,
			postgres: true,
			mongo: true,
			compose: true,
		},
	});

	for (const backup of backupsResult) {
		scheduleJob({
			backupId: backup.backupId,
			type: "backup",
			cronSchedule: backup.schedule,
		});
	}
	logger.info({ Quantity: backupsResult.length }, "Backups Initialized");

	const schedulesResult = await db.query.schedules.findMany({
		where: eq(schedules.enabled, true),
		with: {
			application: {
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
		},
	);

	for (const schedule of filteredSchedulesBasedOnServerStatus) {
		scheduleJob({
			scheduleId: schedule.scheduleId,
			type: "schedule",
			cronSchedule: schedule.cronExpression,
		});
	}
	logger.info(
		{ Quantity: filteredSchedulesBasedOnServerStatus.length },
		"Schedules Initialized",
	);

	const volumeBackupsResult = await db.query.volumeBackups.findMany({
		where: eq(volumeBackups.enabled, true),
		with: {
			application: {
				with: {
					server: true,
				},
			},
			compose: {
				with: {
					server: true,
				},
			},
		},
	});

	const filteredVolumeBackupsBasedOnServerStatus = volumeBackupsResult.filter(
		(volumeBackup) => {
			if (volumeBackup.application) {
				return volumeBackup.application.server?.serverStatus === "active";
			}
			if (volumeBackup.compose) {
				return volumeBackup.compose.server?.serverStatus === "active";
			}
		},
	);

	for (const volumeBackup of filteredVolumeBackupsBasedOnServerStatus) {
		scheduleJob({
			volumeBackupId: volumeBackup.volumeBackupId,
			type: "volume-backup",
			cronSchedule: volumeBackup.cronExpression,
		});
	}

	logger.info(
		{ Quantity: filteredVolumeBackupsBasedOnServerStatus.length },
		"Volume Backups Initialized",
	);
};
