import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import type { z } from "zod";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { normalizeRestoreBackupFile } from "./safe-input";
import { getRestoreCommand } from "./utils";

export const restoreMongoBackup = async (
	mongo: Mongo,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mongo;

		const { objectPath } = normalizeRestoreBackupFile(backupInput.backupFile, [
			".bson.gz",
		]);
		const safeDestination = await assertRcloneS3DestinationAllowed(destination);
		const backupPath = getRcloneS3Destination(safeDestination, objectPath);
		const rcloneCommand = buildRcloneS3Command("copy", safeDestination, [
			backupPath,
		]);

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
			backupFile: objectPath,
		});

		emit("Starting restore...");
		emit(`Restoring database: ${backupInput.databaseName} from ${objectPath}`);

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
