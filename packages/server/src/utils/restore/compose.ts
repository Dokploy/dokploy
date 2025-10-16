import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import type { Destination } from "@dokploy/server/services/destination";
import type { z } from "zod";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
        getRestoreCommand,
        normalizeGpgError,
        prepareGpgDecryption,
        resolveBackupGpgMaterial,
} from "./utils";

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
                const backupPath = `${bucketPath}/${backupInput.backupFile}`;
                const baseDownloadCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}"`;
                const { privateKey, passphrase } = await resolveBackupGpgMaterial(
                        backupInput,
                );

                const { setup, decryptCommand } = prepareGpgDecryption({
                        privateKey,
                        passphrase,
                });
                let downloadPipeline = `${baseDownloadCommand} | gunzip`;

                if (decryptCommand) {
                        downloadPipeline = `${baseDownloadCommand} | ${decryptCommand} --output - | gunzip`;
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

                const restoreSteps = backupInput.databaseType === "mongo"
                        ? getRestoreCommand({
                                  appName: appName,
                                  serviceName: backupInput.metadata?.serviceName,
                                  type: backupInput.databaseType,
                                  credentials: {
                                          database: backupInput.databaseName,
                                          ...credentials,
                                  },
                                  restoreType: composeType,
                                  rcloneCommand: decryptCommand
                                          ? baseDownloadCommand
                                          : `rclone copy ${rcloneFlags.join(" ")} "${backupPath}"`,
                                  backupFile: backupInput.backupFile,
                                  decryptCommand,
                          })
                        : getRestoreCommand({
                                  appName: appName,
                                  serviceName: backupInput.metadata?.serviceName,
                                  type: backupInput.databaseType,
                                  credentials: {
                                          database: backupInput.databaseName,
                                          ...credentials,
                                  },
                                  restoreType: composeType,
                                  rcloneCommand: downloadPipeline,
                          });

                emit("Starting restore...");
                emit(`Backup path: ${backupPath}`);

                const command = `
set -eo pipefail;
${setup}
${restoreSteps}
`;

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
