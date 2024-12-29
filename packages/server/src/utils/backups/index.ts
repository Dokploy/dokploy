import { findAdmin } from "@dokploy/server/services/admin";
import { getAllServers } from "@dokploy/server/services/server";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
} from "../docker/utils";
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
		const { serverId, enableDockerCleanup, name } = server;
		if (enableDockerCleanup) {
			scheduleJob(serverId, "0 0 * * *", async () => {
				console.log(
					`SERVER-BACKUP[${new Date().toLocaleString()}] Running Cleanup ${name}`,
				);
				await cleanUpUnusedImages(serverId);
				await cleanUpDockerBuilder(serverId);
				await cleanUpSystemPrune(serverId);
				await sendDockerCleanupNotifications(
					admin.adminId,
					`Docker cleanup for Server ${name} (${serverId})`,
				);
			});
		}
	}

	const pgs = await db.query.postgres.findMany({
		with: {
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
			const { schedule, backupId, enabled, database } = backup;
			if (enabled) {
				console.log(
					`[Backup] Postgres DB ${pg.name} for ${database} Activated`,
				);
				scheduleJob(backupId, schedule, async () => {
					console.log(
						`PG-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
					);
					runPostgresBackup(pg, backup);
				});
			}
		}
	}

	const mariadbs = await db.query.mariadb.findMany({
		with: {
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
			const { schedule, backupId, enabled, database } = backup;
			if (enabled) {
				console.log(
					`[Backup] MariaDB DB ${maria.name} for ${database} Activated`,
				);
				scheduleJob(backupId, schedule, async () => {
					console.log(
						`MARIADB-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
					);
					await runMariadbBackup(maria, backup);
				});
			}
		}
	}

	const mongodbs = await db.query.mongo.findMany({
		with: {
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
				console.log(`[Backup] MongoDB DB ${mongo.name} Activated`);
				scheduleJob(backupId, schedule, async () => {
					console.log(
						`MONGO-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
					);
					await runMongoBackup(mongo, backup);
				});
			}
		}
	}

	const mysqls = await db.query.mysql.findMany({
		with: {
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
				console.log(`[Backup] MySQL DB ${mysql.name} Activated`);
				scheduleJob(backupId, schedule, async () => {
					console.log(
						`MYSQL-SERVER[${new Date().toLocaleString()}] Running Backup ${backupId}`,
					);
					await runMySqlBackup(mysql, backup);
				});
			}
		}
	}
};
