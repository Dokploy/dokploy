import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { getPostgresCredentials, isExternalDatabase } from "@dokploy/server/db/constants";
import type { BackupSchedule } from "@dokploy/server/services/backup";
import {
	createDeploymentBackup,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findDestinationById } from "@dokploy/server/services/destination";
import { quote } from "shell-quote";
import { execAsync } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";

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

			const creds = getPostgresCredentials();

			if (isExternalDatabase()) {
				// External database: use pg_dump directly against the remote host
				writeStream.write(`Running external database dump\n`);
				await execAsync(
					`pg_dump -v -Fc -h ${quote([creds.host])} -p ${quote([creds.port])} -U ${quote([creds.user])} -d ${quote([creds.database])} -f ${quote([`${tempDir}/database.sql`])}`,
					{ env: { ...process.env, PGPASSWORD: creds.password } },
				);
			} else {
				// Built-in Docker Swarm postgres: exec into the container
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

				const dumpCommand = `docker exec ${quote([postgresContainerId])} pg_dump -v -Fc -U ${quote([creds.user])} -d ${quote([creds.database])} -f /tmp/database.sql`;
				writeStream.write(`Running dump command: ${dumpCommand}\n`);
				await execAsync(dumpCommand);

				const copyCommand = `docker cp ${quote([postgresContainerId])}:/tmp/database.sql ${quote([`${tempDir}/database.sql`])}`;
				writeStream.write(`Copying database dump: ${copyCommand}\n`);
				await execAsync(copyCommand);

				const cleanupCommand = `docker exec ${quote([postgresContainerId])} rm -f /tmp/database.sql`;
				writeStream.write(`Cleaning up temp file: ${cleanupCommand}\n`);
				await execAsync(cleanupCommand);
			}

			writeStream.write("Database dump complete\n");

			await execAsync(
				`rsync -a --ignore-errors ${BASE_PATH}/ ${tempDir}/filesystem/`,
			);

			writeStream.write("Copied filesystem to temp directory\n");

			await execAsync(
				// Zip all .sql files since we created more than one
				`cd ${tempDir} && zip -r ${backupFileName} *.sql filesystem/ > /dev/null 2>&1`,
			);

			writeStream.write("Zipped database and filesystem\n");

			const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${tempDir}/${backupFileName}" "${s3Path}"`;
			writeStream.write("Running command to upload backup to S3\n");
			await execAsync(uploadCommand);
			writeStream.write("Uploaded backup to S3 ✅\n");
			writeStream.end();
			await updateDeploymentStatus(deployment.deploymentId, "done");
			return true;
		} finally {
			try {
				await rm(tempDir, { recursive: true, force: true });
			} catch (cleanupError) {
				console.error("Cleanup error:", cleanupError);
			}
		}
	} catch (error) {
		console.error("Backup error:", error);
		writeStream.write("Backup error❌\n");
		writeStream.write(
			error instanceof Error ? error.message : "Unknown error\n",
		);
		writeStream.end();
		await updateDeploymentStatus(deployment.deploymentId, "error");
		throw error;
	}
};
