import type { Destination } from "@dokploy/server/services/destination";
import type { Compose } from "@dokploy/server/services/compose";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import type { Backup } from "@dokploy/server/services/backup";
import { getComposeContainer } from "../docker/utils";
import {
	getMariadbRestoreCommand,
	getMongoRestoreCommand,
	getMysqlRestoreCommand,
	getPostgresRestoreCommand,
} from "./utils";

export const restoreComposeBackup = async (
	compose: Compose,
	destination: Destination,
	database: string,
	backupFile: string,
	metadata: Backup["metadata"] & { serviceName: string },
	emit: (log: string) => void,
) => {
	try {
		const { serverId } = compose;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerId } = await getComposeContainer(
			compose,
			metadata.serviceName || "",
		);
		let restoreCommand = "";

		if (metadata.postgres) {
			restoreCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | ${getPostgresRestoreCommand(containerId, database, metadata.postgres.databaseUser)}`;
		} else if (metadata.mariadb) {
			restoreCommand = `
			rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | ${getMariadbRestoreCommand(containerId, database, metadata.mariadb.databaseUser, metadata.mariadb.databasePassword)}
		  `;
		} else if (metadata.mysql) {
			restoreCommand = `
			rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | ${getMysqlRestoreCommand(containerId, database, metadata.mysql.databaseRootPassword)}
		  `;
		} else if (metadata.mongo) {
			const tempDir = "/tmp/dokploy-restore";
			const fileName = backupFile.split("/").pop() || "backup.dump.gz";
			const decompressedName = fileName.replace(".gz", "");
			restoreCommand = `\
			rm -rf ${tempDir} && \
			mkdir -p ${tempDir} && \
			rclone copy ${rcloneFlags.join(" ")} "${backupPath}" ${tempDir} && \
			cd ${tempDir} && \
			gunzip -f "${fileName}" && \
		    ${getMongoRestoreCommand(containerId, database, metadata.mongo.databaseUser, metadata.mongo.databasePassword)} < "${decompressedName}" && \
			rm -rf ${tempDir}`;
		}

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);

		emit(`Executing command: ${restoreCommand}`);

		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(
				serverId,
				restoreCommand,
			);
			emit(stdout);
			emit(stderr);
		} else {
			const { stdout, stderr } = await execAsync(restoreCommand);
			emit(stdout);
			emit(stderr);
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
