import path from "node:path";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import type { Mongo } from "@dokploy/server/services/mongo";
import { findProjectById } from "@dokploy/server/services/project";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getS3Credentials } from "./utils";

// mongodb://mongo:Bqh7AQl-PRbnBu@localhost:27017/?tls=false&directConnection=true
export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mongo;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = path.join(prefix, backupFileName);

	try {
		const rcloneFlags = getS3Credentials(destination);
		const rcloneDestination = `:s3:${destination.bucket}/${bucketDestination}`;

		const rcloneCommand = `rclone rcat ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
		if (mongo.serverId) {
			const { Id: containerId } = await getRemoteServiceContainer(
				mongo.serverId,
				appName,
			);
			const mongoDumpCommand = `docker exec ${containerId} sh -c "mongodump -d '${database}' -u '${databaseUser}' -p '${databasePassword}' --archive --authenticationDatabase=admin --gzip"`;

			await execAsyncRemote(
				mongo.serverId,
				`${mongoDumpCommand} | ${rcloneCommand}`,
			);
		} else {
			const { Id: containerId } = await getServiceContainer(appName);
			const mongoDumpCommand = `docker exec ${containerId} sh -c "mongodump -d '${database}' -u '${databaseUser}' -p '${databasePassword}'  --archive --authenticationDatabase=admin --gzip"`;
			await execAsync(`${mongoDumpCommand} | ${rcloneCommand}`);
		}

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "success",
			adminId: project.adminId,
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
			adminId: project.adminId,
		});
		throw error;
	}
};
// mongorestore -d monguito -u mongo -p Bqh7AQl-PRbnBu --authenticationDatabase admin --gzip --archive=2024-04-13T05:03:58.937Z.dump.gz
