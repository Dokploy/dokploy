import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mongo } from "@dokploy/server/services/mongo";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getBackupCommand, getS3Credentials, normalizeS3Path, getRcloneUploadCommand } from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";

export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { projectId, name } = mongo;
	const project = await findProjectById(projectId);
	const { prefix } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MongoDB Backup",
		description: "MongoDB Backup",
	});
	try {
		const rcloneCommand = getRcloneUploadCommand(destination, '-', backupFileName, prefix);
		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
		);

		if (mongo.serverId) {
			await execAsyncRemote(mongo.serverId, backupCommand);
		} else {
			await execAsync(backupCommand, {
				shell: "/bin/bash",
			});
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "success",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
