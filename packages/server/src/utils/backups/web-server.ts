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
				writeStream.write("PostgreSQL container not found❌");
				writeStream.end();
				throw new Error("PostgreSQL container not found");
			}

			writeStream.write(`PostgreSQL container ID: ${containerId}`);

			const postgresContainerId = containerId.trim();

			const postgresCommand = `docker exec ${postgresContainerId} pg_dump -v -Fc -U dokploy -d dokploy > '${tempDir}/database.sql'`;

			writeStream.write(`Running command: ${postgresCommand}`);
			await execAsync(postgresCommand);

			await execAsync(`cp -r ${BASE_PATH}/* ${tempDir}/filesystem/`);

			writeStream.write("Copied filesystem to temp directory");

			await execAsync(
				// Zip all .sql files since we created more than one
				`cd ${tempDir} && zip -r ${backupFileName} *.sql filesystem/ > /dev/null 2>&1`,
			);

			writeStream.write("Zipped database and filesystem");

			const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${tempDir}/${backupFileName}" "${s3Path}"`;
			writeStream.write(`Running command: ${uploadCommand}`);
			await execAsync(uploadCommand);
			writeStream.write("Uploaded backup to S3 ✅");
			writeStream.end();
			await updateDeploymentStatus(deployment.deploymentId, "done");
			return true;
		} finally {
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error("Backup error:", error);
		writeStream.write("Backup error❌\n");
		writeStream.write(error instanceof Error ? error.message : "Unknown error");
		writeStream.end();
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
