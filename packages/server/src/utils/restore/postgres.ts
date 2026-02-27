import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Postgres } from "@dokploy/server/services/postgres";
import type { z } from "zod";
import {
	buildRcloneCatCommand,
	getRcloneConfigSetupCommand,
	getRcloneRemotePath,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restorePostgresBackup = async (
	postgres: Postgres,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseUser, serverId } = postgres;

		const backupPath = getRcloneRemotePath(
			destination,
			backupInput.backupFile,
		);

		const rcloneCommand = `${buildRcloneCatCommand(destination, backupPath)} | gunzip`;

		// Write the config file for non-S3 backends
		const configSetup = getRcloneConfigSetupCommand(destination);

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);

		const restoreCmd = getRestoreCommand({
			appName,
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
			},
			type: "postgres",
			rcloneCommand,
			restoreType: "database",
		});

		const command = configSetup
			? `${configSetup} && ${restoreCmd}`
			: restoreCmd;

		emit(`Executing command: ${command}`);

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
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
