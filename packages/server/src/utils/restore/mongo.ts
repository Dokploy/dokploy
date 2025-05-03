import type { Destination } from "@dokploy/server/services/destination";
import type { Mongo } from "@dokploy/server/services/mongo";
import { getS3Credentials } from "../backups/utils";
import { getServiceContainer } from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getMongoRestoreCommand } from "./utils";

export const restoreMongoBackup = async (
	mongo: Mongo,
	destination: Destination,
	database: string,
	backupFile: string,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databasePassword, databaseUser, serverId } = mongo;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerId } = await getServiceContainer(appName, serverId);

		// For MongoDB, we need to first download the backup file since mongorestore expects a directory
		const tempDir = "/tmp/dokploy-restore";
		const fileName = backupFile.split("/").pop() || "backup.dump.gz";
		const decompressedName = fileName.replace(".gz", "");
		const restoreCommand = getMongoRestoreCommand(
			containerId,
			database,
			databaseUser,
			databasePassword || "",
		);

		const downloadCommand = `\
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
rclone copy ${rcloneFlags.join(" ")} "${backupPath}" ${tempDir} && \
cd ${tempDir} && \
gunzip -f "${fileName}" && \
${restoreCommand} < "${decompressedName}" && \
rm -rf ${tempDir}`;

		emit("Starting restore...");

		emit(`Executing command: ${downloadCommand}`);

		if (serverId) {
			await execAsyncRemote(serverId, downloadCommand);
		} else {
			await execAsync(downloadCommand);
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
