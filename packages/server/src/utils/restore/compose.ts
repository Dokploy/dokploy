import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { Destination } from "@dokploy/server/services/destination";
import type { z } from "zod";
import {
	getEncryptionConfigFromDestination,
	getS3Credentials,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand, isEncryptedBackup } from "./utils";

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

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const encryptionConfig = getEncryptionConfigFromDestination(destination);
		const isEncrypted = isEncryptedBackup(backupInput.backupFile);
		const backupPath = `${bucketPath}/${backupInput.backupFile}`;

		let rcloneCommand: string;
		if (backupInput.metadata?.mongo) {
			// Mongo uses rclone copy regardless of encryption
			rcloneCommand = `rclone copy ${rcloneFlags.join(" ")} "${backupPath}"`;
		} else if (isEncrypted) {
			// For encrypted non-mongo, don't decompress - getRestoreCommand handles it
			rcloneCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}"`;
		} else {
			rcloneCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip`;
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
			encryptionConfig: isEncrypted ? encryptionConfig : undefined,
		});

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);
		if (isEncrypted) {
			emit("🔐 Encrypted backup detected - will decrypt during restore");
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
