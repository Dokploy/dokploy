import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import type { z } from "zod";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { normalizeRestoreBackupFile } from "./safe-input";
import { getRestoreCommand } from "./utils";

export const restoreMySqlBackup = async (
	mysql: MySql,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseRootPassword, serverId } = mysql;

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
			type: "mysql",
			credentials: {
				database: backupInput.databaseName,
				databasePassword: databaseRootPassword,
			},
			restoreType: "database",
			rcloneCommand,
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
				error instanceof Error ? error.message : "Error restoring mysql backup"
			}`,
		);
		throw new Error(
			error instanceof Error ? error.message : "Error restoring mysql backup",
		);
	}
};
