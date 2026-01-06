import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mariadb } from "@dokploy/server/services/mariadb";
import type { z } from "zod";
import { buildRcloneCommand, getRcloneS3Remote } from "../backups/utils";
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

		// Get rclone remote (decryption is handled transparently if encryption is enabled)
		const { remote, envVars } = getRcloneS3Remote(destination);
		const backupPath = `${remote}/${backupInput.backupFile}`;

		// With rclone crypt, decryption happens automatically when reading from the crypt remote
		const rcloneCommand = buildRcloneCommand(
			`rclone cat "${backupPath}" | gunzip`,
			envVars,
		);

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
			backupFile: backupInput.backupFile,
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
