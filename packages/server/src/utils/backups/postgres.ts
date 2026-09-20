import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { redactRcloneCredentials } from "./redact";
import {
	getBackupCommand,
	getBackupTimestamp,
	getRcloneFlags,
	getRcloneRemotePath,
	normalizeS3Path,
} from "./utils";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { name, environmentId, appName } = postgres;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);

	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Initializing Backup",
		description: "Initializing Backup",
	});
	const { prefix } = backup;
	const destination = await findDestinationById(backup.destinationId);
	const backupFileName = `${getBackupTimestamp()}.sql.gz`;
	const bucketDestination = `${appName}/${normalizeS3Path(prefix)}${backupFileName}`;
	try {
		const rcloneFlags = getRcloneFlags(destination);
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
			databaseName: backup.database,
		});

		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		const safeErrorMessage = redactRcloneCredentials(
			error instanceof Error ? error.message : String(error),
		);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			errorMessage: safeErrorMessage || "Error message not provided",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});

		await updateDeploymentStatus(deployment.deploymentId, "error");

		throw error;
	} finally {
	}
};
