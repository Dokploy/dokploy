import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getPostgresBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import { createDeploymentBackup } from "@dokploy/server/services/deployment";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { appName, databaseUser, name, projectId } = postgres;
	const project = await findProjectById(projectId);

	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Postgres Backup",
		description: "Postgres Backup",
	});
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

		const { Id: containerId } = await getServiceContainer(
			appName,
			postgres.serverId,
		);

		const command = getPostgresBackupCommand(
			containerId,
			database,
			databaseUser || "",
		);

		if (postgres.serverId) {
			await execAsyncRemote(postgres.serverId, `${command} | ${rcloneCommand}`);
		} else {
			await execAsync(`${command} | ${rcloneCommand}`);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "postgres",
			type: "success",
			organizationId: project.organizationId,
		});
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

		throw error;
	} finally {
	}
};
