import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { MySql } from "@dokploy/server/services/mysql";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getMysqlBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { appName, databaseRootPassword, projectId, name } = mysql;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;

	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const { Id: containerId } = await getServiceContainer(
			appName,
			mysql.serverId,
		);

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		const command = getMysqlBackupCommand(
			containerId,
			database,
			databaseRootPassword || "",
		);
		if (mysql.serverId) {
			await execAsyncRemote(mysql.serverId, `${command} | ${rcloneCommand}`);
		} else {
			await execAsync(`${command} | ${rcloneCommand}`);
		}
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
			organizationId: project.organizationId,
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
			organizationId: project.organizationId,
		});
		throw error;
	}
};
