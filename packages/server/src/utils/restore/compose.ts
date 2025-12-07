import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { Destination } from "@dokploy/server/services/destination";
import type { z } from "zod";
import {
	getEncryptionConfigFromDestination,
	getRcloneS3Remote,
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

		const encryptionConfig = getEncryptionConfigFromDestination(destination);
		const { remote, envVars } = getRcloneS3Remote(destination, encryptionConfig);
		const backupPath = `${remote}/${backupInput.backupFile}`;

		let rcloneCommand: string;
		if (backupInput.metadata?.mongo) {
			// Mongo uses rclone copy
			rcloneCommand = envVars
				? `${envVars} rclone copy "${backupPath}"`
				: `rclone copy "${backupPath}"`;
		} else {
			// With rclone crypt, decryption happens automatically when reading from the crypt remote
			rcloneCommand = envVars
				? `${envVars} rclone cat "${backupPath}" | gunzip`
				: `rclone cat "${backupPath}" | gunzip`;
		}

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

		const restoreCommand = getRestoreCommand({
			appName: appName,
			serviceName: backupInput.metadata?.serviceName,
			type: backupInput.databaseType,
			credentials: {
				database: backupInput.databaseName,
				...credentials,
			},
			restoreType: composeType,
			rcloneCommand,
			backupFile: backupInput.backupFile,
		});

		emit("Starting restore...");
		emit(`Backup file: ${backupInput.backupFile}`);
		if (encryptionConfig.enabled) {
			emit("🔐 Encryption enabled - will decrypt during restore (rclone crypt)");
		}

		emit(`Executing command: ${restoreCommand}`);

		if (serverId) {
			await execAsyncRemote(serverId, restoreCommand);
		} else {
			await execAsync(restoreCommand);
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
