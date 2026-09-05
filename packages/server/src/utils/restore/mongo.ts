import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import { quote } from "shell-quote";
import type { z } from "zod";
import { getSafeRcloneErrorMessage } from "../backups/redact";
import { getRclonePathAndFlags } from "../backups/utils";
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

		const { flags: rcloneFlags, path: backupPath } =
			await getRclonePathAndFlags(destination, backupInput.backupFile);
		const rcloneCommand = `rclone copy ${rcloneFlags.join(" ")} ${quote([backupPath])}`;

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
		emit(
			`Restoring database: ${backupInput.databaseName} from ${backupInput.backupFile}`,
		);

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}

		emit("Restore completed successfully!");
	} catch (error) {
		const safeErrorMessage = getSafeRcloneErrorMessage(error);
		console.error("Restore error:", safeErrorMessage);
		emit(`Error: ${safeErrorMessage}`);
		throw new Error(safeErrorMessage);
	}
};
