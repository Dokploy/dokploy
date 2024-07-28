import { readFile } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { BackupSchedule } from "@dokploy/server/api/services/backup";
import type { Destination } from "@dokploy/server/api/services/destination";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { runMariadbBackup } from "./mariadb";
import { runMongoBackup } from "./mongo";
import { runMySqlBackup } from "./mysql";
import { runPostgresBackup } from "./postgres";

export const uploadToS3 = async (
	destination: Destination,
	destinationBucketPath: string,
	filePath: string,
) => {
	const { accessKey, secretAccessKey, bucket, region, endpoint } = destination;

	const s3Client = new S3Client({
		region: region,
		...(endpoint && {
			endpoint: endpoint,
		}),
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
