import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Mariadb } from "@/server/api/services/mariadb";
import { findProjectById } from "@/server/api/services/project";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { uploadToS3 } from "./utils";

export const runMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mariadb;
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
			`docker exec ${containerId} sh -c "rm -rf /backup && mkdir -p /backup"`,
		);

		await execAsync(
			`docker exec ${containerId} sh -c "mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip  > ${containerPath}"`,
		);
		await execAsync(
			`docker cp ${containerId}:/backup/${backupFileName} ${hostPath}`,
		);
		await uploadToS3(destination, bucketDestination, hostPath);

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	} finally {
		await unlink(hostPath);
	}
};

export const runRemoteMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { appName, databasePassword, databaseUser, projectId, name, serverId } =
		mariadb;

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
		const mariadbDumpCommand = `docker exec ${containerId} sh -c "mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip"`;
		const rcloneFlags = [
			`--s3-access-key-id=${accessKey}`,
			`--s3-secret-access-key=${secretAccessKey}`,
			`--s3-region=${region}`,
			`--s3-endpoint=${endpoint}`,
			"--s3-no-check-bucket",
			"--s3-force-path-style",
		];

		const rcloneDestination = `:s3:${bucket}/${bucketDestination}`;
		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

		await execAsyncRemote(serverId, `${mariadbDumpCommand} | ${rcloneCommand}`);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	}
};
