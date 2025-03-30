import path from "node:path";
import { getAllServers } from "@dokploy/server/services/server";
import { scheduleJob } from "node-schedule";
import { db } from "../../db/index";
import { findAdmin } from "../../services/admin";
import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
} from "../docker/utils";
import { sendDockerCleanupNotifications } from "../notifications/docker-cleanup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { getS3Credentials } from "./utils";

import type { BackupSchedule } from "@dokploy/server/services/backup";
import { startLogCleanup } from "../access-log/handler";

export const initCronJobs = async () => {
	console.log("Setting up cron jobs....");

	const admin = await findAdmin();

	if (admin?.user.enableDockerCleanup) {
		scheduleJob("docker-cleanup", "0 0 * * *", async () => {
			console.log(
				`Docker Cleanup ${new Date().toLocaleString()}]  Running docker cleanup`,
			);
			await cleanUpUnusedImages();
			await cleanUpDockerBuilder();
			await cleanUpSystemPrune();
			await sendDockerCleanupNotifications(admin.user.id);
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
					admin.user.id,
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
					await runPostgresBackup(pg, backup);
					await keepLatestNBackups(backup, pg.serverId);
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
					await keepLatestNBackups(backup, maria.serverId);
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
					await keepLatestNBackups(backup, mongo.serverId);
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
					await keepLatestNBackups(backup, mysql.serverId);
				});
			}
		}
	}

	if (admin?.user.logCleanupCron) {
		await startLogCleanup(admin.user.logCleanupCron);
	}
};

export const keepLatestNBackups = async (
	backup: BackupSchedule,
	serverId?: string | null,
) => {
	// 0 also immediately returns which is good as the empty "keep latest" field in the UI
	// is saved as 0 in the database
	if (!backup.keepLatestCount) return;

	try {
		const rcloneFlags = getS3Credentials(backup.destination);
		const backupFilesPath = path.join(
			`:s3:${backup.destination.bucket}`,
			backup.prefix,
		);

		// --include "*.sql.gz" ensures nothing else other than the db backup files are touched by rclone
		const rcloneList = `rclone lsf ${rcloneFlags.join(" ")} --include "*.sql.gz" ${backupFilesPath}`;
		// when we pipe the above command with this one, we only get the list of files we want to delete
		const sortAndPickUnwantedBackups = `sort -r | tail -n +$((${backup.keepLatestCount}+1)) | xargs -I{}`;
		// this command deletes the files
		// to test the deletion before actually deleting we can add --dry-run before ${backupFilesPath}/{}
		const rcloneDelete = `rclone delete ${rcloneFlags.join(" ")} ${backupFilesPath}/{}`;

		const rcloneCommand = `${rcloneList} | ${sortAndPickUnwantedBackups} ${rcloneDelete}`;

		if (serverId) {
			await execAsyncRemote(serverId, rcloneCommand);
		} else {
			await execAsync(rcloneCommand);
		}
	} catch (error) {
		console.error(error);
	}
};
