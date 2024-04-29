import path from "node:path";
import { execAsync } from "../process/execAsync";
import { unlink } from "node:fs/promises";
import { uploadToS3 } from "./utils";
import type { BackupSchedule } from "@/server/api/services/backup";
import type { Postgres } from "@/server/api/services/postgres";
import { getServiceContainer } from "../docker/utils";

export const runPostgresBackup = async (
	postgres: Postgres,
	backup: BackupSchedule,
) => {
	const { appName, databaseUser } = postgres;
	const { prefix, database } = backup;
	const destination = backup.destination;
	const backupFileName = `${new Date().toISOString()}.sql.gz`;
	const bucketDestination = path.join(prefix, backupFileName);
	const containerPath = `/backup/${backupFileName}`;
	const hostPath = `./${backupFileName}`;
	try {
		const { Id: containerId } = await getServiceContainer(appName);

		await execAsync(
			`docker exec ${containerId} /bin/bash -c "rm -rf /backup && mkdir -p /backup"`,
		);
		await execAsync(
			`docker exec ${containerId} sh -c "pg_dump -Fc --no-acl --no-owner -h localhost -U ${databaseUser} --no-password  '${database}' | gzip > ${containerPath}"`,
		);
		await execAsync(`docker cp ${containerId}:${containerPath} ${hostPath}`);

		await uploadToS3(destination, bucketDestination, hostPath);
	} catch (error) {
		console.log(error);
		throw error;
	} finally {
		await unlink(hostPath);
	}
};

// Restore
// /Applications/pgAdmin 4.app/Contents/SharedSupport/pg_restore --host "localhost" --port "5432" --username "mauricio" --no-password --dbname "postgres" --verbose "/Users/mauricio/Downloads/_databases_2024-04-12T07_02_05.234Z.sql"
