import {
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	findBackupById,
	runMariadbBackup,
	runMongoBackup,
	runMySqlBackup,
	runPostgresBackup,
} from "@dokploy/server";
import { logger } from "./logger";
import type { QueueJob } from "./schema";

export const runJobs = async (job: QueueJob) => {
	try {
		if (job.type === "backup") {
			const { backupId } = job;
			const backup = await findBackupById(backupId);
			const { databaseType, postgres, mysql, mongo, mariadb } = backup;
			if (databaseType === "postgres" && postgres) {
				await runPostgresBackup(postgres, backup);
			} else if (databaseType === "mysql" && mysql) {
				await runMySqlBackup(mysql, backup);
			} else if (databaseType === "mongo" && mongo) {
				await runMongoBackup(mongo, backup);
			} else if (databaseType === "mariadb" && mariadb) {
				await runMariadbBackup(mariadb, backup);
			}
		}
		if (job.type === "server") {
			const { serverId } = job;
			await cleanUpUnusedImages(serverId);
			await cleanUpDockerBuilder(serverId);
			await cleanUpSystemPrune(serverId);
			// await sendDockerCleanupNotifications();
		}
	} catch (error) {
		logger.error(error);
	}

	return true;
};
