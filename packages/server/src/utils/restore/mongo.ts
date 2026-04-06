import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import type { z } from "zod";
import { buildRcloneCopyCommand, getDestinationPath } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restoreMongoBackup = async (
	mongo: Mongo,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mongo;

		const backupPath = getDestinationPath(destination, backupInput.backupFile);
		const rcloneCommand = buildRcloneCopyCommand(destination, backupPath);

		const command = getRestoreCommand({
			appName,
			type: "mongo",
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
				databasePassword,
			},
			restoreType: "database",
			rcloneCommand,
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
				error instanceof Error ? error.message : "Error restoring mongo backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mongo backup",
		);
	}
};
