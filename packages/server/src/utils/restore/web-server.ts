import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import type { Destination } from "@dokploy/server/services/destination";
import { getS3Credentials } from "../backups/utils";
import { execAsync } from "../process/execAsync";

export const restoreWebServerBackup = async (
	destination: Destination,
	backupFile: string,
	emit: (log: string) => void,
) => {
	if (IS_CLOUD) {
		return;
	}
	try {
		const rcloneFlags = getS3Credentials(destination);
		const bucketPath = `:s3:${destination.bucket}`;
		const backupPath = `${bucketPath}/${backupFile}`;
		const { BASE_PATH } = paths();

		// Create a temporary directory outside of BASE_PATH
		const tempDir = await mkdtemp(join(tmpdir(), "dokploy-restore-"));

		try {
			emit("Starting restore...");
			emit(`Backup path: ${backupPath}`);
			emit(`Temp directory: ${tempDir}`);

			// Create temp directory
			emit("Creating temporary directory...");
			await execAsync(`mkdir -p ${tempDir}`);

			// Download backup from S3
			emit("Downloading backup from S3...");
			await execAsync(
				`rclone copyto ${rcloneFlags.join(" ")} "${backupPath}" "${tempDir}/${backupFile}"`,
			);

			// List files before extraction
			emit("Listing files before extraction...");
			const { stdout: beforeFiles } = await execAsync(`ls -la ${tempDir}`);
			emit(`Files before extraction: ${beforeFiles}`);

			// Extract backup
			emit("Extracting backup...");
			await execAsync(`cd ${tempDir} && unzip ${backupFile} > /dev/null 2>&1`);

			// Restore filesystem first
			emit("Restoring filesystem...");
			emit(`Copying from ${tempDir}/filesystem/* to ${BASE_PATH}/`);

			// First clean the target directory
			emit("Cleaning target directory...");
			await execAsync(`rm -rf "${BASE_PATH}/"*`);

			// Ensure the target directory exists
			emit("Setting up target directory...");
			await execAsync(`mkdir -p "${BASE_PATH}"`);

			// Copy files preserving permissions
			emit("Copying files...");
			await execAsync(`cp -rp "${tempDir}/filesystem/"* "${BASE_PATH}/"`);

			// Now handle database restore
			emit("Starting database restore...");

			// Check if database.sql.gz exists and decompress it
			const { stdout: hasGzFile } = await execAsync(
				`ls ${tempDir}/database.sql.gz || true`,
			);
			if (hasGzFile.includes("database.sql.gz")) {
				emit("Found compressed database file, decompressing...");
				await execAsync(`cd ${tempDir} && gunzip database.sql.gz`);
			}

			// Verify database file exists
			const { stdout: hasSqlFile } = await execAsync(
				`ls ${tempDir}/database.sql || true`,
			);
			if (!hasSqlFile.includes("database.sql")) {
				throw new Error("Database file not found after extraction");
			}

			const { stdout: postgresContainer } = await execAsync(
				`docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
			);

			if (!postgresContainer) {
				throw new Error("Dokploy Postgres container not found");
			}

			const postgresContainerId = postgresContainer.trim();

			// Drop and recreate database
			emit("Disconnecting all users from database...");
			await execAsync(
				`docker exec ${postgresContainerId} psql -U dokploy postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'dokploy' AND pid <> pg_backend_pid();"`,
			);

			emit("Dropping existing database...");
			await execAsync(
				`docker exec ${postgresContainerId} psql -U dokploy postgres -c "DROP DATABASE IF EXISTS dokploy;"`,
			);

			emit("Creating fresh database...");
			await execAsync(
				`docker exec ${postgresContainerId} psql -U dokploy postgres -c "CREATE DATABASE dokploy;"`,
			);

			// Copy the backup file into the container
			emit("Copying backup file into container...");
			await execAsync(
				`docker cp ${tempDir}/database.sql ${postgresContainerId}:/tmp/database.sql`,
			);

			// Verify file in container
			emit("Verifying file in container...");
			await execAsync(
				`docker exec ${postgresContainerId} ls -l /tmp/database.sql`,
			);

			// Restore from the copied file
			emit("Running database restore...");
			await execAsync(
				`docker exec ${postgresContainerId} pg_restore -v -U dokploy -d dokploy /tmp/database.sql`,
			);

			// Cleanup the temporary file in the container
			emit("Cleaning up container temp file...");
			await execAsync(
				`docker exec ${postgresContainerId} rm /tmp/database.sql`,
			);

			emit("Restore completed successfully!");
		} finally {
			// Cleanup
			emit("Cleaning up temporary files...");
			await execAsync(`rm -rf ${tempDir}`);
		}
	} catch (error) {
		console.error(error);
		emit(
			`Error: ${
				error instanceof Error
					? error.message
					: "Error restoring web server backup"
			}`,
		);
		throw error;
	}
};
