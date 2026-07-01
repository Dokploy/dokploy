import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Postgres } from "@dokploy/server/services/postgres";
import type { z } from "zod";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { normalizeRestoreBackupFile } from "./safe-input";
import { getRestoreCommand } from "./utils";

export const restorePostgresBackup = async (
	postgres: Postgres,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseUser, serverId } = postgres;

		const { objectPath } = normalizeRestoreBackupFile(backupInput.backupFile, [
			".sql.gz",
		]);
		const safeDestination = await assertRcloneS3DestinationAllowed(destination);
		const backupPath = getRcloneS3Destination(safeDestination, objectPath);
		const rcloneCommand = `${buildRcloneS3Command("cat", safeDestination, [
			backupPath,
		])} | gunzip`;

		const command = getRestoreCommand({
			appName,
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
			},
			type: "postgres",
			rcloneCommand,
			restoreType: "database",
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
