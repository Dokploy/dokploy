import type { BackupSchedule } from "@dokploy/server/services/backup";
import { execAsync } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";
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
		const s3Path = `:s3:${destination.bucket}/${normalizeS3Path(backup.prefix)}${backupFileName}`;

		try {
			await execAsync(`mkdir -p ${tempDir}/filesystem`);

			// First get the container ID
			// Returns: ID\nID\nID...
			const { stdout: containerId } = await execAsync(
				"docker ps --filter 'name=dokploy-postgres' -q",
			);

			if (!containerId) {
				throw new Error("PostgreSQL container not found");
			}

			// ID\nID\nID... => [ "ID", "ID", ... ]
			const containers = containerId.trim().split("\n").filter(Boolean); 

			// Then run pg_dump with the container ID
			for (const containerId of containers) {
				// 																Maybe we can find a better identification for this part      vvv
				const postgresCommand = `docker exec ${containerId.trim()} pg_dump -v -Fc -U dokploy -d dokploy > '${tempDir}/database-${containerId}.sql'`;
				await execAsync(postgresCommand);
			}

			await execAsync(`cp -r ${BASE_PATH}/* ${tempDir}/filesystem/`);

			await execAsync( // Zip all .sql files since we created more than one
				`cd ${tempDir} && zip -r ${backupFileName} *.sql filesystem/ > /dev/null 2>&1`,
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
