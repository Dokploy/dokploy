import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import type { MySql } from "@dokploy/server/services/mysql";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { redactRcloneCredentials } from "./redact";
import {
	getBackupCommand,
	getBackupTimestamp,
	getRcloneEnv,
	getRcloneFlags,
	getRcloneRemotePath,
	normalizeS3Path,
} from "./utils";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { environmentId, name, appName } = mysql;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);
	const { prefix } = backup;
	const destination = await findDestinationById(backup.destinationId);
	const backupFileName = `${getBackupTimestamp()}.sql.gz`;
	const bucketDestination = `${appName}/${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MySQL Backup",
		description: "MySQL Backup",
	});

	try {
		const rcloneFlags = getRcloneFlags(destination);
		const rcloneEnv = getRcloneEnv(destination);
		const rcloneDestination = getRcloneRemotePath(
			destination,
			bucketDestination,
		);
		const backupCommand = getBackupCommand(
			backup,
			rcloneFlags,
			rcloneDestination,
			deployment.logPath,
		);

		if (mysql.serverId) {
			await execAsyncRemote(
				mysql.serverId,
				backupCommand,
				undefined,
				rcloneEnv,
			);
		} else {
			await execAsync(backupCommand, {
				shell: "/bin/bash",
				env: { ...process.env, ...rcloneEnv },
			});
		}
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		const safeErrorMessage = redactRcloneCredentials(
			error instanceof Error ? error.message : String(error),
		);
		console.error(safeErrorMessage);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			errorMessage: safeErrorMessage || "Error message not provided",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
