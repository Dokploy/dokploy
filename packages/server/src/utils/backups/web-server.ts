import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import {
	ENCRYPTION_KEY_BACKUP_FILE,
	exportEncryptionKey,
} from "@dokploy/server/lib/encryption";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { sendDokployBackupNotifications } from "../notifications/dokploy-backup";
import { execAsync } from "../process/execAsync";
import { redactRcloneCredentials } from "./redact";
import { getBackupTimestamp, getS3Credentials, normalizeS3Path } from "./utils";

function formatBytes(bytes?: number) {
	if (bytes === undefined) return "Unknown size";
	if (bytes === 0) return "0 B";
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** i;
	return `${value.toFixed(2)} ${sizes[i]} (${bytes} bytes)`;
}

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
	let computedBackupSize: number | undefined;
	try {
		const destination = await findDestinationById(backup.destinationId);
		const rcloneFlags = getS3Credentials(destination);
		const timestamp = getBackupTimestamp();
		const { BASE_PATH } = paths();
		const tempDir = await mkdtemp(join(tmpdir(), "dokploy-backup-"));
		const backupFileName = `webserver-backup-${timestamp}.zip`;
		const s3Path = `:s3:${destination.bucket}/${backup.appName}/${normalizeS3Path(backup.prefix)}${backupFileName}`;

		try {
			await execAsync(`mkdir -p ${tempDir}/filesystem`);

			// First get the container ID
			const { stdout: containerId } = await execAsync(
				`docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
			);

			if (!containerId) {
				writeStream.write("Dokploy postgres container not found❌\n");
				writeStream.end();
				throw new Error("Dokploy postgres container not found");
			}

			writeStream.write(`Dokploy postgres container ID: ${containerId}\n`);

			const postgresContainerId = containerId.trim();

			// First dump the database inside the container
			const dumpCommand = `docker exec ${postgresContainerId} pg_dump -v -Fc -U dokploy -d dokploy -f /tmp/database.sql`;
			writeStream.write(`Running dump command: ${dumpCommand}\n`);
			await execAsync(dumpCommand);

			// Then copy the file from the container to host
			const copyCommand = `docker cp ${postgresContainerId}:/tmp/database.sql ${tempDir}/database.sql`;
			writeStream.write(`Copying database dump: ${copyCommand}\n`);
			await execAsync(copyCommand);

			// Clean up the temp file in the container
			const cleanupCommand = `docker exec ${postgresContainerId} rm -f /tmp/database.sql`;
			writeStream.write(`Cleaning up temp file: ${cleanupCommand}\n`);
			await execAsync(cleanupCommand);

			await execAsync(
				`rsync -a --ignore-errors --no-specials --no-devices --exclude='volume-backups/' --exclude='${ENCRYPTION_KEY_BACKUP_FILE}' ${BASE_PATH}/ ${tempDir}/filesystem/`,
			);

			writeStream.write("Copied filesystem to temp directory\n");

			if (backup.includeEncryptionKey) {
				// Restoring the filesystem places this file at BASE_PATH, where
				// the encryption keyring picks it up as a decryption fallback.
				await writeFile(
					join(tempDir, "filesystem", ENCRYPTION_KEY_BACKUP_FILE),
					exportEncryptionKey(),
					{ mode: 0o600 },
				);
				writeStream.write("Included encryption key in backup\n");
			}

			await execAsync(
				// Zip all .sql files since we created more than one
				`cd ${tempDir} && zip -r ${backupFileName} *.sql filesystem/ > /dev/null 2>&1`,
			);

			writeStream.write("Zipped database and filesystem\n");

			const zipPath = join(tempDir, backupFileName);
			try {
				const { size } = await stat(zipPath);
				computedBackupSize = size;
				writeStream.write(`Backup size: ${size} bytes\n`);
			} catch {
				// If stat fails, keep undefined
			}

			const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${zipPath}" "${s3Path}"`;
			writeStream.write("Running command to upload backup to S3\n");
			await execAsync(uploadCommand);
			writeStream.write("Uploaded backup to S3 ✅\n");
			writeStream.end();
			await sendDokployBackupNotifications({
				type: "success",
				backupSize: formatBytes(computedBackupSize),
			});
			await updateDeploymentStatus(deployment.deploymentId, "done");
			return true;
		} finally {
			try {
				await rm(tempDir, { recursive: true, force: true });
			} catch (cleanupError) {
				console.error(
					"Cleanup error:",
					redactRcloneCredentials(String(cleanupError)),
				);
			}
		}
	} catch (error) {
		const safeErrorMessage = redactRcloneCredentials(
			error instanceof Error ? error.message : String(error),
		);
		console.error("Backup error:", redactRcloneCredentials(String(error)));
		writeStream.write("Backup error❌\n");
		writeStream.write(`${safeErrorMessage}\n`);
		writeStream.end();
		await sendDokployBackupNotifications({
			type: "error",
			errorMessage: safeErrorMessage || "Error message not provided",
			backupSize: formatBytes(computedBackupSize),
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
