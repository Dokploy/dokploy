import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Compose } from "@dokploy/server/services/compose";
import { findProjectById } from "@dokploy/server/services/project";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsyncRemote, execAsyncStream } from "../process/execAsync";
import {
	getMariadbBackupCommand,
	getMysqlBackupCommand,
	getMongoBackupCommand,
	getPostgresBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";
import { getComposeContainer } from "../docker/utils";

export const runComposeBackup = async (
	compose: Compose,
	backup: BackupSchedule,
) => {
	const { projectId, name } = compose;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Compose Backup",
		description: "Compose Backup",
	});
	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const { Id: containerId } = await getComposeContainer(
			compose,
			backup.serviceName || "",
		);

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		let backupCommand = "";

		if (backup.databaseType === "postgres") {
			backupCommand = getPostgresBackupCommand(
				containerId,
				database,
				backup.metadata?.postgres?.databaseUser || "",
			);
		} else if (backup.databaseType === "mariadb") {
			backupCommand = getMariadbBackupCommand(
				containerId,
				database,
				backup.metadata?.mariadb?.databaseUser || "",
				backup.metadata?.mariadb?.databasePassword || "",
			);
		} else if (backup.databaseType === "mysql") {
			backupCommand = getMysqlBackupCommand(
				containerId,
				database,
				backup.metadata?.mysql?.databaseRootPassword || "",
			);
		} else if (backup.databaseType === "mongo") {
			backupCommand = getMongoBackupCommand(
				containerId,
				database,
				backup.metadata?.mongo?.databaseUser || "",
				backup.metadata?.mongo?.databasePassword || "",
			);
		}
		if (compose.serverId) {
			await execAsyncRemote(
				compose.serverId,
				`
				 set -e;
				 Running command.
				${backupCommand} | ${rcloneCommand} >> ${deployment.logPath} 2>> ${deployment.logPath} || {
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				}
				echo "✅ Command executed successfully" >> ${deployment.logPath};
				`,
			);
		} else {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
			await execAsyncStream(
				`${backupCommand} | ${rcloneCommand}`,
				(data) => {
					if (writeStream.write(data)) {
						console.log(data);
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
