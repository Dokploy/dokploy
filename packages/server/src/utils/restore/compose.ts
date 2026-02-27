import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { Destination } from "@dokploy/server/services/destination";
import type { z } from "zod";
import {
	buildRcloneCatCommand,
	buildRcloneCopyCommand,
	getRcloneConfigSetupCommand,
	getRcloneRemotePath,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand } from "./utils";

interface DatabaseCredentials {
	databaseUser?: string;
	databasePassword?: string;
}

export const restoreComposeBackup = async (
	compose: Compose,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		if (backupInput.databaseType === "web-server") {
			return;
		}
		const { serverId, appName, composeType } = compose;

		const backupPath = getRcloneRemotePath(
			destination,
			backupInput.backupFile,
		);

		let rcloneCommand = `${buildRcloneCatCommand(destination, backupPath)} | gunzip`;

		if (backupInput.metadata?.mongo) {
			rcloneCommand = buildRcloneCopyCommand(destination, backupPath);
		}

		const configSetup = getRcloneConfigSetupCommand(destination);

		let credentials: DatabaseCredentials;

		switch (backupInput.databaseType) {
			case "postgres":
				credentials = {
					databaseUser: backupInput.metadata?.postgres?.databaseUser,
				};
				break;
			case "mariadb":
				credentials = {
					databaseUser: backupInput.metadata?.mariadb?.databaseUser,
					databasePassword: backupInput.metadata?.mariadb?.databasePassword,
				};
				break;
			case "mysql":
				credentials = {
					databasePassword: backupInput.metadata?.mysql?.databaseRootPassword,
				};
				break;
			case "mongo":
				credentials = {
					databaseUser: backupInput.metadata?.mongo?.databaseUser,
					databasePassword: backupInput.metadata?.mongo?.databasePassword,
				};
				break;
		}

		const restoreCmd = getRestoreCommand({
			appName: appName,
			serviceName: backupInput.metadata?.serviceName,
			type: backupInput.databaseType,
			credentials: {
				database: backupInput.databaseName,
				...credentials,
			},
			restoreType: composeType,
			rcloneCommand,
		});

		const command = configSetup
			? `${configSetup} && ${restoreCmd}`
			: restoreCmd;

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);
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
