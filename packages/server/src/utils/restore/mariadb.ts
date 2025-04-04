import type { Destination } from "@dokploy/server/services/destination";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import { getS3Credentials } from "../backups/utils";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";

export const restoreMariadbBackup = async (
	mariadb: Mariadb,
	destination: Destination,
	database: string,
	backupFile: string,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mariadb;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerName } = serverId
			? await getRemoteServiceContainer(serverId, appName)
			: await getServiceContainer(appName);

		const restoreCommand = `
    rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerName} mariadb -u ${databaseUser} -p${databasePassword} ${database}
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
				error instanceof Error
					? error.message
					: "Error restoring mariadb backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mariadb backup",
		);
	}
};
