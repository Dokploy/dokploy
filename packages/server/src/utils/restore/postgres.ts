import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Postgres } from "@dokploy/server/services/postgres";
import type { z } from "zod";
import {
	getEncryptionConfigFromDestination,
	getS3Credentials,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRestoreCommand, isEncryptedBackup } from "./utils";

export const restorePostgresBackup = async (
	postgres: Postgres,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseUser, serverId } = postgres;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const encryptionConfig = getEncryptionConfigFromDestination(destination);
		const isEncrypted = isEncryptedBackup(backupInput.backupFile);

		const backupPath = `${bucketPath}/${backupInput.backupFile}`;

		// For encrypted files, we don't decompress here - getRestoreCommand handles decryption
		const rcloneCommand = isEncrypted
			? `rclone cat ${rcloneFlags.join(" ")} "${backupPath}"`
			: `rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip`;

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);
		if (isEncrypted) {
			emit("🔐 Encrypted backup detected - will decrypt during restore");
		}

		const command = getRestoreCommand({
			appName,
			credentials: {
				database: backupInput.databaseName,
				databaseUser,
			},
			type: "postgres",
			rcloneCommand,
			restoreType: "database",
			backupFile: backupInput.backupFile,
			encryptionConfig: isEncrypted ? encryptionConfig : undefined,
		});

		emit(`Executing command: ${command}`);

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
