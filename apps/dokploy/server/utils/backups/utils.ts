import { readFile } from "node:fs/promises";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Destination } from "@/server/api/services/destination";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { runMariadbBackup, runRemoteMariadbBackup } from "./mariadb";
import { runMongoBackup, runRemoteMongoBackup } from "./mongo";
import { runMySqlBackup, runRemoteMySqlBackup } from "./mysql";
import { runPostgresBackup, runRemotePostgresBackup } from "./postgres";

export const uploadToS3 = async (
	destination: Destination,
	destinationBucketPath: string,
	filePath: string,
) => {
	const { accessKey, secretAccessKey, bucket, region, endpoint } = destination;

	const s3Client = new S3Client({
		region: region,
		endpoint: endpoint,
		credentials: {
			accessKeyId: accessKey,
			secretAccessKey: secretAccessKey,
		},
		forcePathStyle: true,
	});

	const fileContent = await readFile(filePath);
	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: destinationBucketPath,
		Body: fileContent,
	});

	await s3Client.send(command);
};
export const scheduleBackup = (backup: BackupSchedule) => {
	const { schedule, backupId, databaseType, postgres, mysql, mongo, mariadb } =
		backup;
	scheduleJob(backupId, schedule, async () => {
		if (databaseType === "postgres" && postgres) {
			if (postgres.serverId) {
				await runRemotePostgresBackup(postgres, backup);
			} else {
				await runPostgresBackup(postgres, backup);
			}
		} else if (databaseType === "mysql" && mysql) {
			if (mysql.serverId) {
				await runRemoteMySqlBackup(mysql, backup);
			} else {
				await runMySqlBackup(mysql, backup);
			}
		} else if (databaseType === "mongo" && mongo) {
			if (mongo.serverId) {
				await runRemoteMongoBackup(mongo, backup);
			} else {
				await runMongoBackup(mongo, backup);
			}
		} else if (databaseType === "mariadb" && mariadb) {
			if (mariadb.serverId) {
				await runRemoteMariadbBackup(mariadb, backup);
			} else {
				await runMariadbBackup(mariadb, backup);
			}
		}
	});
};

export const removeScheduleBackup = (backupId: string) => {
	const currentJob = scheduledJobs[backupId];
	currentJob?.cancel();
};
