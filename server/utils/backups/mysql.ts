import { unlink } from "node:fs/promises";
import path from "node:path";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { MySql } from "@/server/api/services/mysql";
import { sendDatabaseBackupNotifications } from "@/server/api/services/notification";
import { findProjectById } from "@/server/api/services/project";
import { getServiceContainer } from "../docker/utils";
import { execAsync } from "../process/execAsync";
import { uploadToS3 } from "./utils";

export const runMySqlBackup = async (mysql: MySql, backup: BackupSchedule) => {
	const { appName, databaseRootPassword, projectId, name } = mysql;
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
			`docker exec ${containerId} sh -c "mysqldump --default-character-set=utf8mb4 -u 'root' --password='${databaseRootPassword}' --single-transaction --no-tablespaces --quick '${database}'  | gzip > ${containerPath}"`,
		);
		await execAsync(
			`docker cp ${containerId}:/backup/${backupFileName} ${hostPath}`,
		);
		await uploadToS3(destination, bucketDestination, hostPath);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "success",
		});
	} catch (error) {
		console.log(error);
		await sendDatabaseBackupNotifications({
			applicationName: name,
			projectName: project.name,
			databaseType: "mysql",
			type: "error",
			errorMessage: error?.message || "Error message not provided",
		});
		throw error;
	} finally {
		await unlink(hostPath);
	}
};
