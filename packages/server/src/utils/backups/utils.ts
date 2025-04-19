import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Destination } from "@dokploy/server/services/destination";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { keepLatestNBackups } from ".";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";
import { runWebServerBackup } from "./web-server";

export const scheduleBackup = (backup: BackupSchedule) => {
	const { schedule, backupId, databaseType, postgres, mysql, mongo, mariadb } =
		backup;
	scheduleJob(backupId, schedule, async () => {
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
		} else if (databaseType === "web-server") {
			await runWebServerBackup(backup);
			await keepLatestNBackups(backup);
		}
	});
};

export const removeScheduleBackup = (backupId: string) => {
	const currentJob = scheduledJobs[backupId];
	currentJob?.cancel();
};

export const normalizeS3Path = (prefix: string) => {
	// Trim whitespace and remove leading/trailing slashes
	const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
	// Return empty string if prefix is empty, otherwise append trailing slash
	return normalizedPrefix ? `${normalizedPrefix}/` : "";
};

export const getS3Credentials = (destination: Destination) => {
	const { accessKey, secretAccessKey, region, endpoint, provider } =
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
