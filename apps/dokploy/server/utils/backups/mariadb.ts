import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Mariadb } from "@/server/api/services/mariadb";
import { findProjectById } from "@/server/api/services/project";
import { getServiceContainer } from "../docker/utils";
import { sendDatabaseBackupNotifications } from "../notifications/database-backup";
import { execAsync } from "../process/execAsync";
import { uploadToS3 } from "./utils";

export const runMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { appName, databasePassword, databaseUser, projectId, name } = mariadb;
	const project = await findProjectById(projectId);
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = path.join(prefix, backupFileName);
	const containerPath = `/backup/${backupFileName}`;
	const hostPath = `./${backupFileName}`;

	try {
		const { Id: containerId } = await getServiceContainer(appName);
		await execAsync(
			`docker exec ${containerId} sh -c "rm -rf /backup && mkdir -p /backup"`,
		);

		await execAsync(
			`docker exec ${containerId} sh -c "mariadb-dump --user='${databaseUser}' --password='${databasePassword}' --databases ${database} | gzip  > ${containerPath}"`,
		);
		await execAsync(
			`docker cp ${containerId}:/backup/${backupFileName} ${hostPath}`,
		);
		await uploadToS3(destination, bucketDestination, hostPath);

		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mariadb",
			type: "error",
			// @ts-ignore
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	} finally {
		await unlink(hostPath);
	}
};
