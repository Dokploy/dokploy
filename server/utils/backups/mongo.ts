import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Mongo } from "@/server/api/services/mongo";
import { findProjectById } from "@/server/api/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync } from "../process/execAsync";
import { uploadToS3 } from "./utils";

// mongodb://mongo:Bqh7AQl-PRbnBu@localhost:27017/?tls=false&directConnection=true
export const runMongoBackup = async (mongo: Mongo, backup: BackupSchedule) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mongo;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.dump.gz`;
	const bucketDestination = path.join(prefix, backupFileName);
	const containerPath = `/backup/${backupFileName}`;
	const hostPath = `./${backupFileName}`;

	try {
		const { Id: containerId } = await getServiceContainer(appName);
		await execAsync(
			`docker exec ${containerId} sh -c "rm -rf /backup && mkdir -p /backup"`,
		);

		await execAsync(
			`docker exec ${containerId} sh -c "mongodump -d '${database}' -u '${databaseUser}' -p '${databasePassword}' --authenticationDatabase=admin --archive=${containerPath} --gzip"`,
		);
		await execAsync(`docker cp ${containerId}:${containerPath} ${hostPath}`);
		await uploadToS3(destination, bucketDestination, hostPath);

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mongodb",
			type: "error",
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	} finally {
		await unlink(hostPath);
	}
};
// mongorestore -d monguito -u mongo -p Bqh7AQl-PRbnBu --authenticationDatabase admin --gzip --archive=2024-04-13T05:03:58.937Z.dump.gz
