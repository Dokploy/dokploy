import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Postgres } from "@/server/api/services/postgres";
import { findProjectById } from "@/server/api/services/project";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { uploadToS3 } from "./utils";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { appName, databaseUser, name, projectId } = postgres;
	const project = await findProjectById(projectId);

	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = path.join(prefix, backupFileName);
	const containerPath = `/backup/${backupFileName}`;
	const hostPath = `./${backupFileName}`;
	try {
		const { Id: containerId } = await getServiceContainer(appName);

		await execAsync(
			`docker exec ${containerId} /bin/bash -c "rm -rf /backup && mkdir -p /backup"`,
		);
		await execAsync(
			`docker exec ${containerId} sh -c "pg_dump -Fc --no-acl --no-owner -h localhost -U ${databaseUser} --no-password  '${database}' | gzip > ${containerPath}"`,
		);
		await execAsync(`docker cp ${containerId}:${containerPath} ${hostPath}`);

		await uploadToS3(destination, bucketDestination, hostPath);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "success",
		});
	} catch (error) {
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});

		throw error;
	} finally {
		await unlink(hostPath);
	}
};

// Restore
// /Applications/pgAdmin 4.app/Contents/SharedSupport/pg_restore --host "localhost" --port "5432" --username "mauricio" --no-password --dbname "postgres" --verbose "/Users/mauricio/Downloads/_databases_2024-04-12T07_02_05.234Z.sql"

export const runRemotePostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { appName, databaseUser, name, projectId, serverId } = postgres;

	if (!serverId) {
		throw new Error("Server ID not provided");
	}
	const project = await findProjectById(projectId);

	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = path.join(prefix, backupFileName);
	const { accessKey, secretAccessKey, bucket, region, endpoint } = destination;

	try {
		const { Id: containerId } = await getRemoteServiceContainer(
			serverId,
			appName,
		);
		const pgDumpCommand = `docker exec ${containerId} sh -c "pg_dump -Fc --no-acl --no-owner -h localhost -U ${databaseUser} --no-password '${database}' | gzip"`;
		const rcloneFlags = [
			// `--s3-provider=Cloudflare`,
			`--s3-access-key-id=${accessKey}`,
			`--s3-secret-access-key=${secretAccessKey}`,
			`--s3-region=${region}`,
			`--s3-endpoint=${endpoint}`,
			"--s3-no-check-bucket",
			"--s3-force-path-style",
		];

		const rcloneDestination = `:s3:${bucket}/${bucketDestination}`;
		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

		console.log(`${pgDumpCommand} | ${rcloneCommand}`);
		await execAsyncRemote(
			postgres.serverId,
			`${pgDumpCommand} | ${rcloneCommand}`,
		);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});

		throw error;
	} finally {
	}
};
