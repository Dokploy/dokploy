import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Postgres } from "@dokploy/server/services/postgres";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsyncRemote, execAsyncStream } from "../process/execAsync";
import {
	getPostgresBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";

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
			await execAsyncRemote(
				postgres.serverId,
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
			writeStream.write("Backup done✅");
			writeStream.end();
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
