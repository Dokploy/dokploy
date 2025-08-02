import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import type { z } from "zod";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restoreMariadbBackup = async (
	mariadb: Mariadb,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, serverId, databaseUser, databasePassword } = mariadb;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupInput.backupFile}`;

		const rcloneCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip`;

		const command = getRestoreCommand({
			appName,
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
				databasePassword,
			},
			type: "mariadb",
			rcloneCommand,
			restoreType: "database",
		});

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
