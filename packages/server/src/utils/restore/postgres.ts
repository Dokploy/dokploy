import type { Destination } from "@dokploy/server/services/destination";
import type { Postgres } from "@dokploy/server/services/postgres";
import { getS3Credentials } from "../backups/utils";
import { getServiceContainer } from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getPostgresRestoreCommand } from "./utils";

export const restorePostgresBackup = async (
	postgres: Postgres,
	destination: Destination,
	database: string,
	backupFile: string,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseUser, serverId } = postgres;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;

		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerId } = await getServiceContainer(appName, serverId);

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);

		const restoreCommand = getPostgresRestoreCommand(
			containerId,
			database,
			databaseUser,
		);

		const command = `\
rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | ${restoreCommand}`;

		emit(`Executing command: ${command}`);

		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);
			emit(stdout);
			emit(stderr);
		} else {
			const { stdout, stderr } = await execAsync(command);
			emit(stdout);
			emit(stderr);
		}

		emit("Restore completed successfully!");
	} catch (error) {
		emit(
			`Error: ${
				error instanceof Error
					? error.message
					: "Error restoring postgres backup"
			}`,
		);
		throw error;
	}
};
