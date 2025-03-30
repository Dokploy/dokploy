import type { BackupSchedule } from "@dokploy/server/services/backup";
import { execAsync } from "../process/execAsync";
import { getS3Credentials } from "./utils";
import { findDestinationById } from "@dokploy/server/services/destination";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const runWebServerBackup = async (backup: BackupSchedule) => {
	try {
		if (IS_CLOUD) {
			return;
		}
		const destination = await findDestinationById(backup.destinationId);
		const rcloneFlags = getS3Credentials(destination);
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const { BASE_PATH } = paths();
		const tempDir = await mkdtemp(join(tmpdir(), "dokploy-backup-"));
		const backupFileName = `webserver-backup-${timestamp}.zip`;
		const s3Path = `:s3:${destination.bucket}/${backup.prefix}${backupFileName}`;

		try {
			await execAsync(`mkdir -p ${tempDir}/filesystem`);

			const postgresCommand = `docker exec $(docker ps --filter "name=dokploy-postgres" -q) pg_dump -v -Fc -U dokploy -d dokploy > ${tempDir}/database.sql`;
			await execAsync(postgresCommand);

			await execAsync(`cp -r ${BASE_PATH}/* ${tempDir}/filesystem/`);

			await execAsync(
				`cd ${tempDir} && zip -r ${backupFileName} database.sql filesystem/`,
			);

			const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${tempDir}/${backupFileName}" "${s3Path}"`;
			await execAsync(uploadCommand);
			return true;
		} finally {
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error("Backup error:", error);
		throw error;
	}
};
