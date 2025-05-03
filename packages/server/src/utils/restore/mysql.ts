import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import { getS3Credentials } from "../backups/utils";
import { getServiceContainer } from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getMysqlRestoreCommand } from "./utils";

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

		const { Id: containerId } = await getServiceContainer(appName, serverId);

		const restoreCommand = getMysqlRestoreCommand(
			containerId,
			database,
			databaseRootPassword || "",
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
				error instanceof Error ? error.message : "Error restoring mysql backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mysql backup",
		);
	}
};
