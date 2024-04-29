import { unlink } from "node:fs/promises";
import path from "node:path";
import { execAsync } from "../process/execAsync";
import { uploadToS3 } from "./utils";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Mariadb } from "@/server/api/services/mariadb";
import { getServiceContainer } from "../docker/utils";

export const runMariadbBackup = async (
	mariadb: Mariadb,
	backup: BackupSchedule,
) => {
	const { appName, databasePassword, databaseUser } = mariadb;
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
	} catch (error) {
		console.log(error);
		throw error;
	} finally {
		await unlink(hostPath);
	}
};
