import type { BackupSchedule } from "@dokploy/server/services/backup";
import { execAsync } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";
import { findDestinationById } from "@dokploy/server/services/destination";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { createWriteStream } from "node:fs";

export const runWebServerBackup = async (backup: BackupSchedule) => {
	if (IS_CLOUD) {
		return;
	}

	const deployment = await createDeploymentBackup({
		backupId: backup.backupId,
		title: "Web Server Backup",
		description: "Web Server Backup",
	});
	const writeStream = createWriteStream(deployment.logPath, { flags: "a" });

	try {
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
			const { stdout: containerId } = await execAsync(
				`docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
			);

			if (!containerId) {
				throw new Error("PostgreSQL container not found");
			}

			const postgresContainerId = containerId.trim();

			const postgresCommand = `docker exec ${postgresContainerId} pg_dump -v -Fc -U dokploy -d dokploy > '${tempDir}/database.sql'`;
			await execAsync(postgresCommand);

			await execAsync(`cp -r ${BASE_PATH}/* ${tempDir}/filesystem/`);

			await execAsync(
				// Zip all .sql files since we created more than one
				`cd ${tempDir} && zip -r ${backupFileName} *.sql filesystem/ > /dev/null 2>&1`,
			);

			const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${tempDir}/${backupFileName}" "${s3Path}"`;
			await execAsync(uploadCommand);
			writeStream.write("Backup done✅");
			writeStream.end();
			await updateDeploymentStatus(deployment.deploymentId, "done");
			return true;
		} finally {
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error("Backup error:", error);
		writeStream.write("Backup error❌");
		writeStream.write(error instanceof Error ? error.message : "Unknown error");
		writeStream.end();
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
