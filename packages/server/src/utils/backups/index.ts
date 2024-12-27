import { findAdmin } from "@dokploy/server/services/admin";
import { getAllServers } from "@dokploy/server/services/server";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { sendDockerCleanupNotifications } from "../notifications/docker-cleanup";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";

export const initCronJobs = async () => {
	console.log("Setting up cron jobs....");

	const admin = await findAdmin();

	if (admin?.enableDockerCleanup) {
		scheduleJob("docker-cleanup", "0 0 * * *", async () => {
			console.log(
				`Docker Cleanup ${new Date().toLocaleString()}]  Running docker cleanup`,
			);
			await cleanUpUnusedImages();
			await cleanUpDockerBuilder();
			await cleanUpSystemPrune();
			await sendDockerCleanupNotifications(admin.adminId);
		});
	}

	const servers = await getAllServers();

	for (const server of servers) {
		const { appName, serverId, enableDockerCleanup } = server;
		if (enableDockerCleanup) {
			scheduleJob(serverId, "0 0 * * *", async () => {
				console.log(
					`SERVER-BACKUP[${new Date().toLocaleString()}] Running Cleanup ${appName}`,
				);
				await cleanUpUnusedImages(serverId);
				await cleanUpDockerBuilder(serverId);
				await cleanUpSystemPrune(serverId);
				await sendDockerCleanupNotifications(
					admin.adminId,
					`Docker cleanup for Server ${appName}`,
				);
			});
		}
	}

	const pgs = await db.query.postgres.findMany({
		with: {
			project: true,
			backups: {
				with: {
					destination: true,
					postgres: true,
					mariadb: true,
					mysql: true,
					mongo: true,
				},
			},
		},
	});
	for (const pg of pgs) {
		for (const backup of pg.backups) {
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
				try {
					scheduleJob(backupId, schedule, async () => {
						console.log(
							`PG-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
						);
						runPostgresBackup(pg, backup);
					});

					await sendDatabaseBackupNotifications({
						applicationName: pg.name,
						projectName: pg.project.name,
						databaseType: "postgres",
						type: "success",
						adminId: pg.project.adminId,
					});
				} catch (error) {
					await sendDatabaseBackupNotifications({
						applicationName: pg.name,
						projectName: pg.project.name,
						databaseType: "postgres",
						type: "error",
						// @ts-ignore
						errorMessage: error?.message || "Error message not provided",
						adminId: pg.project.adminId,
					});
				}
			}
		}
	}

	const mariadbs = await db.query.mariadb.findMany({
		with: {
			project: true,
			backups: {
				with: {
					destination: true,
					postgres: true,
					mariadb: true,
					mysql: true,
					mongo: true,
				},
			},
		},
	});

	for (const maria of mariadbs) {
		for (const backup of maria.backups) {
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
				try {
					scheduleJob(backupId, schedule, async () => {
						console.log(
							`MARIADB-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
						);
						await runMariadbBackup(maria, backup);
					});
					await sendDatabaseBackupNotifications({
						applicationName: maria.name,
						projectName: maria.project.name,
						databaseType: "mariadb",
						type: "success",
						adminId: maria.project.adminId,
					});
				} catch (error) {
					await sendDatabaseBackupNotifications({
						applicationName: maria.name,
						projectName: maria.project.name,
						databaseType: "mariadb",
						type: "error",
						// @ts-ignore
						errorMessage: error?.message || "Error message not provided",
						adminId: maria.project.adminId,
					});
				}
			}
		}
	}

	const mongodbs = await db.query.mongo.findMany({
		with: {
			project: true,
			backups: {
				with: {
					destination: true,
					postgres: true,
					mariadb: true,
					mysql: true,
					mongo: true,
				},
			},
		},
	});

	for (const mongo of mongodbs) {
		for (const backup of mongo.backups) {
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
				try {
					scheduleJob(backupId, schedule, async () => {
						console.log(
							`MONGO-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
						);
						await runMongoBackup(mongo, backup);
					});
					await sendDatabaseBackupNotifications({
						applicationName: mongo.name,
						projectName: mongo.project.name,
						databaseType: "mongodb",
						type: "success",
						adminId: mongo.project.adminId,
					});
				} catch (error) {
					await sendDatabaseBackupNotifications({
						applicationName: mongo.name,
						projectName: mongo.project.name,
						databaseType: "mongodb",
						type: "error",
						// @ts-ignore
						errorMessage: error?.message || "Error message not provided",
						adminId: mongo.project.adminId,
					});
				}
			}
		}
	}

	const mysqls = await db.query.mysql.findMany({
		with: {
			project: true,
			backups: {
				with: {
					destination: true,
					postgres: true,
					mariadb: true,
					mysql: true,
					mongo: true,
				},
			},
		},
	});

	for (const mysql of mysqls) {
		for (const backup of mysql.backups) {
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
				try {
					scheduleJob(backupId, schedule, async () => {
						console.log(
							`MYSQL-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
						);
						await runMySqlBackup(mysql, backup);
					});
					await sendDatabaseBackupNotifications({
						applicationName: mysql.name,
						projectName: mysql.project.name,
						databaseType: "mysql",
						type: "success",
						adminId: mysql.project.adminId,
					});
				} catch (error) {
					await sendDatabaseBackupNotifications({
						applicationName: mysql.name,
						projectName: mysql.project.name,
						databaseType: "mysql",
						type: "error",
						// @ts-ignore
						errorMessage: error?.message || "Error message not provided",
						adminId: mysql.project.adminId,
					});
				}
			}
		}
	}
};
