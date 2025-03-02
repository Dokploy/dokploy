import path from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import { findProjectById } from "@dokploy/server/services/project";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getS3Credentials } from "./utils";

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

	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		if (mariadb.serverId) {
			const { Id: containerId } = await getRemoteServiceContainer(
				mariadb.serverId,
				appName,
			);
			const mariadbDumpCommand = `docker exec ${containerId} sh -c "mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip"`;

			await execAsyncRemote(
				mariadb.serverId,
				`${mariadbDumpCommand} | ${rcloneCommand}`,
			);
		} else {
			const { Id: containerId } = await getServiceContainer(appName);
			const mariadbDumpCommand = `docker exec ${containerId} sh -c "mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip"`;

			await execAsync(`${mariadbDumpCommand} | ${rcloneCommand}`);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
			adminId: project.adminId,
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
			adminId: project.adminId,
		});
		throw error;
	}
};
