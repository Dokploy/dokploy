import { findAdmin } from "@dokploy/server/api/services/admin";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
} from "../docker/utils";
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
		});
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
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
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
			const { schedule, backupId, enabled } = backup;
			if (enabled) {
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
