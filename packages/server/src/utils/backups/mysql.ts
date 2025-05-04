import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { MySql } from "@dokploy/server/services/mysql";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getBackupCommand, getS3Credentials, normalizeS3Path } from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { projectId, name } = mysql;
	const project = await findProjectById(projectId);
	const { prefix } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MySQL Backup",
		description: "MySQL Backup",
	});

	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
		);

		if (mysql.serverId) {
			await execAsyncRemote(mysql.serverId, backupCommand);
		} else {
			await execAsync(backupCommand);
		}
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
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
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
