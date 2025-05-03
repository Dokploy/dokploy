import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mongo } from "@dokploy/server/services/mongo";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsyncRemote, execAsyncStream } from "../process/execAsync";
import {
	getMongoBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";

export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mongo;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;
	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "MongoDB Backup",
		description: "MongoDB Backup",
	});
	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const { Id: containerId } = await getServiceContainer(
			appName,
			mongo.serverId,
		);

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		const command = getMongoBackupCommand(
			containerId,
			database,
			databaseUser || "",
			databasePassword || "",
		);
		if (mongo.serverId) {
			await execAsyncRemote(
				mongo.serverId,
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
