import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";

export const scheduleBackup = (backup: BackupSchedule) => {
	const { schedule, backupId, databaseType, postgres, mysql, mongo, mariadb } =
		backup;
	scheduleJob(backupId, schedule, async () => {
		if (databaseType === "postgres" && postgres) {
			await runPostgresBackup(postgres, backup);
		} else if (databaseType === "mysql" && mysql) {
			await runMySqlBackup(mysql, backup);
		} else if (databaseType === "mongo" && mongo) {
			await runMongoBackup(mongo, backup);
		} else if (databaseType === "mariadb" && mariadb) {
			await runMariadbBackup(mariadb, backup);
		}
	});
};

export const removeScheduleBackup = (backupId: string) => {
	const currentJob = scheduledJobs[backupId];
	currentJob?.cancel();
};

export const getS3Credentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, bucket, region, endpoint, provider } =
		destination;
	const rcloneFlags = [
		`--s3-access-key-id=${accessKey}`,
		`--s3-secret-access-key=${secretAccessKey}`,
		`--s3-region=${region}`,
		`--s3-endpoint=${endpoint}`,
		"--s3-no-check-bucket",
		"--s3-force-path-style",
	];

	if (provider) {
		rcloneFlags.unshift(`--s3-provider=${provider}`);
	}

	return rcloneFlags;
};
