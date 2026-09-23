import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import { quote } from "shell-quote";
import type { z } from "zod";
import { redactRcloneCredentials } from "../backups/redact";
import {
	getRcloneEnv,
	getRcloneFlags,
	getRcloneRemotePath,
} from "../backups/utils";
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

		const rcloneFlags = getRcloneFlags(destination);
		const rcloneEnv = getRcloneEnv(destination);
		const backupPath = getRcloneRemotePath(destination, backupInput.backupFile);

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
			await execAsyncRemote(serverId, command, undefined, rcloneEnv);
		} else {
			await execAsync(command, {
				env: { ...process.env, ...rcloneEnv },
			});
		}

		emit("Restore completed successfully!");
	} catch (error) {
		const safeErrorMessage = redactRcloneCredentials(
			error instanceof Error ? error.message : "Error restoring mysql backup",
		);
		console.error(safeErrorMessage);
		emit(`Error: ${safeErrorMessage}`);
		throw new Error(safeErrorMessage);
	}
};
