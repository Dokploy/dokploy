import type { Destination } from "@dokploy/server/services/destination";
import { getS3Credentials } from "../backups/utils";
import {
	getRemoteServiceContainer,
	getServiceContainer,
} from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";

export const restoreWebServerBackup = async (
	destination: Destination,
	backupFile: string,
	emit: (log: string) => void,
) => {
	try {
		const { appName, databaseUser, serverId } = postgres;

		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;

		const backupPath = `${bucketPath}/${backupFile}`;

		const { Id: containerName } = serverId
			? await getRemoteServiceContainer(serverId, appName)
			: await getServiceContainer(appName);

		emit("Starting restore...");
		emit(`Backup path: ${backupPath}`);

		const command = `\
rclone cat ${rcloneFlags.join(" ")} "${backupPath}" | gunzip | docker exec -i ${containerName} pg_restore -U ${databaseUser} -d ${database} --clean --if-exists`;

		emit(`Executing command: ${command}`);

		if (serverId) {
			const { stdout, stderr } = await execAsyncRemote(serverId, command);
			emit(stdout);
			emit(stderr);
		} else {
			const { stdout, stderr } = await execAsync(command);
			console.log("stdout", stdout);
			console.log("stderr", stderr);
			emit(stdout);
			emit(stderr);
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
