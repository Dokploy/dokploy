import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { MySql } from "@/server/api/services/mysql";
import { findProjectById } from "@/server/api/services/project";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { uploadToS3 } from "./utils";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { appName, databaseRootPassword, projectId, name } = mysql;
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
			`docker exec ${containerId} sh -c "mysqldump --default-character-set=utf8mb4 -u 'root' --password='${databaseRootPassword}' --single-transaction --no-tablespaces --quick '${database}'  | gzip > ${containerPath}"`,
		);
		await execAsync(
			`docker cp ${containerId}:/backup/${backupFileName} ${hostPath}`,
		);
		await uploadToS3(destination, bucketDestination, hostPath);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	} finally {
		await unlink(hostPath);
	}
};

export const runRemoteMySqlBackup = async (
	mysql: MySql,
	backup: BackupSchedule,
) => {
	const { appName, databaseRootPassword, projectId, name, serverId } = mysql;

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

		const mysqlDumpCommand = `docker exec ${containerId} sh -c "mysqldump --default-character-set=utf8mb4 -u 'root' --password='${databaseRootPassword}' --single-transaction --no-tablespaces --quick '${database}' | gzip"`;
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

		await execAsyncRemote(serverId, `${mysqlDumpCommand} | ${rcloneCommand}`);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	}
};
