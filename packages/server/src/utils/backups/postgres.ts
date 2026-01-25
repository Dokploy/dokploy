import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findEnvironmentById } from "@dokploy/server/services/environment";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getBackupCommand,
	getContainerSearchCommand,
	getCreateDatabaseBackupTempService,
	getRemoveServiceCommand,
	getS3Credentials,
	getServiceExistsCommand,
	getServiceNodeCommand,
	normalizeS3Path,
} from "./utils";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { name, environmentId } = postgres;
	const environment = await findEnvironmentById(environmentId);
	const project = await findProjectById(environment.projectId);

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
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;
		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		const searchCommand = getContainerSearchCommand(backup);

		if (!searchCommand) {
			throw new Error("searchCommand is empty");
		}

		const { stdout: serviceId } = await execAsync(searchCommand, {
			shell: "/bin/bash",
		});

		const backupCommand = getBackupCommand(
			backup,
			rcloneCommand,
			deployment.logPath,
		);

		if (serviceId) {
			if (postgres.serverId) {
				await execAsyncRemote(postgres.serverId, backupCommand);
			} else {
				await execAsync(backupCommand, {
					shell: "/bin/bash",
				});
			}
		} else {
			const serviceNodeCommend = getServiceNodeCommand(postgres.appName);
			const { stdout: node } = await execAsync(serviceNodeCommend, {
				shell: "/bin/bash",
			});

			const serviceExistCommand = getServiceExistsCommand(postgres.appName);
			const { stdout: exist } = await execAsync(serviceExistCommand, {
				shell: "/bin/bash",
			});

			if (exist.trim() === "true") {
				const removeServiceCommand = getRemoveServiceCommand(postgres.appName);
				await execAsync(removeServiceCommand, {
					shell: "/bin/bash",
				});
			}

			const createDatabaseBackupTempService =
				getCreateDatabaseBackupTempService(
					backup,
					postgres.appName,
					node,
					rcloneCommand,
				);

			await execAsync(createDatabaseBackupTempService, {
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
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
			databaseName: backup.database,
		});

		await updateDeploymentStatus(deployment.deploymentId, "error");

		throw error;
	} finally {
	}
};
