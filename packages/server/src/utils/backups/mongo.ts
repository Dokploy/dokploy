import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import type { Mongo } from "@dokploy/server/services/mongo";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getBackupCommand,
	getEncryptionConfigFromDestination,
	getRcloneS3Remote,
	normalizeS3Path,
} from "./utils";

export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { environmentId, name } = mongo;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);
	const { prefix } = backup;
	const destination = backup.destination;
	const encryptionConfig = getEncryptionConfigFromDestination(destination);
	const backupFileName = `${new Date().toISOString()}.archive.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MongoDB Backup",
		description: "MongoDB Backup",
	});
	try {
		const { remote, envVars } = getRcloneS3Remote(destination, encryptionConfig);
		const rcloneDestination = `${remote}/${bucketDestination}`;
		const rcloneCommand = envVars
			? `${envVars} rclone rcat "${rcloneDestination}"`
			: `rclone rcat "${rcloneDestination}"`;

		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
			encryptionConfig,
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
			databaseName: backup.database,
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
			databaseName: backup.database,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
