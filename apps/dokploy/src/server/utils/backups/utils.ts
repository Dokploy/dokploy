import type { BackupSchedule } from "@/server/api/services/backup";
import type { Destination } from "@/server/api/services/destination";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { readFile } from "node:fs/promises";
import { runPostgresBackup } from "./postgres";
import { runMySqlBackup } from "./mysql";
import { runMongoBackup } from "./mongo";
import { runMariadbBackup } from "./mariadb";

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
