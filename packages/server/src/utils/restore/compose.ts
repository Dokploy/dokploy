import type { Destination } from "@dokploy/server/services/destination";
import type { Compose } from "@dokploy/server/services/compose";
import { getS3Credentials } from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import type { Backup } from "@dokploy/server/services/backup";
import { getFindContainerCommand } from "../backups/compose";

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

		const command = getFindContainerCommand(compose, metadata.serviceName);

		console.log("command", command);
		let containerId = "";
		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);
			emit(stdout);
			emit(stderr);
			containerId = stdout.trim();
		} else {
			const { stdout, stderr } = await execAsync(command);
			console.log("stdout", stdout);
			console.log("stderr", stderr);
			emit(stdout);
			emit(stderr);
			containerId = stdout.trim();
		}
		let restoreCommand = "";

		if (metadata.postgres) {
			restoreCommand = `rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerId} pg_restore -U ${metadata.postgres.databaseUser} -d ${database} --clean --if-exists`;
		} else if (metadata.mariadb) {
			restoreCommand = `
			rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerId} mariadb -u ${metadata.mariadb.databaseUser} -p${metadata.mariadb.databasePassword} ${database}
		  `;
		} else if (metadata.mysql) {
			restoreCommand = `
			rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerId} mysql -u root -p${metadata.mysql.databaseRootPassword} ${database}
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
			docker exec -i ${containerId} mongorestore --username ${metadata.mongo.databaseUser} --password ${metadata.mongo.databasePassword} --authenticationDatabase admin --db ${database} --archive < "${decompressedName}" && \
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
