import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsyncRemote, execAsyncStream } from "../process/execAsync";
import {
	getMariadbBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";

export const runMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mariadb;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MariaDB Backup",
		description: "MariaDB Backup",
	});
	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const { Id: containerId } = await getServiceContainer(
			appName,
			mariadb.serverId,
		);

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

		const command = getMariadbBackupCommand(
			containerId,
			database,
			databaseUser,
			databasePassword || "",
		);
		if (mariadb.serverId) {
			await execAsyncRemote(
				mariadb.serverId,
				`
				set -e;
				echo "Running command." >> ${deployment.logPath};
				export RCLONE_LOG_LEVEL=DEBUG;
				${command} | ${rcloneCommand} >> ${deployment.logPath} 2>> ${deployment.logPath} || {
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				}
				echo "✅ Command executed successfully" >> ${deployment.logPath};
				`,
			);
		} else {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
			await execAsyncStream(
				`${command} | ${rcloneCommand}`,
				(data) => {
					if (writeStream.writable) {
						writeStream.write(data);
					}
				},
				{
					env: {
						...process.env,
						RCLONE_LOG_LEVEL: "DEBUG",
					},
				},
			);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
			organizationId: project.organizationId,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
