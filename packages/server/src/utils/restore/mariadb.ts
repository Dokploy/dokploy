import type { Destination } from "@dokploy/server/services/destination";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import { getS3Credentials } from "../backups/utils";
import { getServiceContainer } from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getMariadbRestoreCommand } from "./utils";

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

		const { Id: containerId } = await getServiceContainer(appName, serverId);

		const restoreCommand = getMariadbRestoreCommand(
			containerId,
			database,
			databaseUser,
			databasePassword || "",
		);

		const command = `
    rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | ${restoreCommand}
  `;

		emit("Starting restore...");

		emit(`Executing command: ${command}`);

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
