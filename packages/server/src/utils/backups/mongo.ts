import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mongo } from "@dokploy/server/services/mongo";
import { findProjectById } from "@dokploy/server/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	getMongoBackupCommand,
	getS3Credentials,
	normalizeS3Path,
} from "./utils";

export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mongo;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = `${normalizeS3Path(prefix)}${backupFileName}`;

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
			await execAsyncRemote(mongo.serverId, `${command} | ${rcloneCommand}`);
		} else {
			await execAsync(`${command} | ${rcloneCommand}`);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "success",
			organizationId: project.organizationId,
		});
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
		throw error;
	}
};
