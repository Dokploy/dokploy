import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { MySql } from "@dokploy/server/services/mysql";
import type { z } from "zod";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
        getRestoreCommand,
        normalizeGpgError,
        prepareGpgDecryption,
        resolveBackupGpgMaterial,
} from "./utils";

export const restoreMySqlBackup = async (
	mysql: MySql,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseRootPassword, serverId } = mysql;

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
                const downloadPipeline = decryptCommand
                        ? `${baseDownloadCommand} | ${decryptCommand} --output - | gunzip`
                        : `${baseDownloadCommand} | gunzip`;

                const restoreSteps = getRestoreCommand({
                        appName,
                        type: "mysql",
                        credentials: {
                                database: backupInput.databaseName,
                                databasePassword: databaseRootPassword,
                        },
                        restoreType: "database",
                        rcloneCommand: downloadPipeline,
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
