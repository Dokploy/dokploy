import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getBackupCommand, getS3Credentials, normalizeS3Path, getRcloneUploadCommand } from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { name, projectId } = postgres;
	const project = await findProjectById(projectId);

	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Initializing Backup",
		description: "Initializing Backup",
	});
	const { prefix } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	try {
		const rcloneCommand = getRcloneUploadCommand(destination, '-', backupFileName, prefix);
		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
		);
		if (postgres.serverId) {
			await execAsyncRemote(postgres.serverId, backupCommand);
		} else {
			await execAsync(backupCommand, {
				shell: "/bin/bash",
			});
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "success",
			organizationId: project.organizationId,
		});

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
		});

		await updateDeploymentStatus(deployment.deploymentId, "error");

		throw error;
	} finally {
	}
};
