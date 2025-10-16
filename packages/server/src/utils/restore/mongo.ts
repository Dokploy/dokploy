import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import type { z } from "zod";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
        getRestoreCommand,
        normalizeGpgError,
        prepareGpgDecryption,
        resolveBackupGpgMaterial,
} from "./utils";

export const restoreMongoBackup = async (
	mongo: Mongo,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mongo;

                const rcloneFlags = getS3Credentials(destination);
                const bucketPath = `:s3:${destination.bucket}`;
                const backupPath = `${bucketPath}/${backupInput.backupFile}`;
                const baseDownloadCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}"`;
                const { privateKey, passphrase } = await resolveBackupGpgMaterial(
                        backupInput,
                );

                const { setup, decryptCommand } = prepareGpgDecryption({
                        privateKey,
                        passphrase,
                });

                const rcloneCommand = decryptCommand
                        ? baseDownloadCommand
                        : `rclone copy ${rcloneFlags.join(" ")} "${backupPath}"`;

                const restoreSteps = getRestoreCommand({
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
                        decryptCommand,
                });

                const command = `
set -eo pipefail;
${setup}
${restoreSteps}
`;

                emit("Starting restore...");

                emit("Executing restore command...");

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}

		emit("Restore completed successfully!");
        } catch (rawError) {
                const error = normalizeGpgError(rawError);
                console.error(error);
                emit(`Error: ${error.message}`);
                throw error;
        }
};
