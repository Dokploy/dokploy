import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import { quote } from "shell-quote";
import type { z } from "zod";
import { getSafeRcloneErrorMessage } from "../backups/redact";
import { getRclonePathAndFlags } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

export const restoreMySqlBackup = async (
	mysql: MySql,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseRootPassword, serverId } = mysql;

		const { flags: rcloneFlags, path: backupPath } =
			await getRclonePathAndFlags(destination, backupInput.backupFile);
		const rcloneCommand = `rclone cat ${rcloneFlags.join(" ")} ${quote([backupPath])} | gunzip`;

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
