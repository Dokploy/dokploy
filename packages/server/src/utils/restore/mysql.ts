import type { MySql } from "@dokploy/server/services/mysql";
import type { Destination } from "@dokploy/server/services/destination";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getS3Credentials } from "../backups/utils";

export const restoreMySqlBackup = async (
	mysql: MySql,
	destination: Destination,
	database: string,
	backupFile: string,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseRootPassword, serverId } = mysql;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerName } = serverId
			? await getRemoteServiceContainer(serverId, appName)
			: await getServiceContainer(appName);

		const restoreCommand = `
    rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerName} mysql -u root -p${databaseRootPassword} ${database}
  `;

		emit("Starting restore...");

		emit(`Executing command: ${restoreCommand}`);

		if (serverId) {
			await execAsyncRemote(serverId, restoreCommand);
		} else {
			await execAsync(restoreCommand);
		}

		emit("Restore completed successfully!");
	} catch (error) {
		console.error(error);
		emit(
			`Error: ${
				error instanceof Error ? error.message : "Error restoring mysql backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mysql backup",
		);
	}
};
