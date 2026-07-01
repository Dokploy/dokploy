import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import type { Destination } from "@dokploy/server/services/destination";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
} from "../backups/utils";
import { execAsync } from "../process/execAsync";
import { normalizeRestoreBackupFile, quoteRestoreShellArg } from "./safe-input";

const WEB_SERVER_ARCHIVE_ROOT = "filesystem";
const WEB_SERVER_DATABASE_FILES = new Set(["database.sql", "database.sql.gz"]);

export const validateWebServerArchiveMemberPath = (memberPath: string) => {
	if (typeof memberPath !== "string") {
		throw new Error("Unsafe backup archive member");
	}

	if (
		!memberPath ||
		memberPath.includes("\0") ||
		/[\r\n\t]/.test(memberPath) ||
		memberPath.includes("\\") ||
		memberPath.startsWith("/") ||
		/^[A-Za-z]:[\\/]/.test(memberPath) ||
		memberPath.startsWith("//")
	) {
		throw new Error(`Unsafe backup archive member: ${memberPath}`);
	}

	const withoutTrailingSlash = memberPath.replace(/\/+$/, "");
	if (!withoutTrailingSlash) {
		throw new Error(`Unsafe backup archive member: ${memberPath}`);
	}

	const normalized = path.posix.normalize(withoutTrailingSlash);
	const segments = normalized.split("/");
	if (
		normalized !== withoutTrailingSlash ||
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../") ||
		segments.includes("..") ||
		segments.includes(".git")
	) {
		throw new Error(`Unsafe backup archive member: ${memberPath}`);
	}

	if (WEB_SERVER_DATABASE_FILES.has(normalized)) {
		return;
	}

	if (
		normalized === WEB_SERVER_ARCHIVE_ROOT ||
		normalized.startsWith(`${WEB_SERVER_ARCHIVE_ROOT}/`)
	) {
		return;
	}

	throw new Error(`Unexpected backup archive member: ${memberPath}`);
};

export const validateWebServerArchiveMembers = (members: string[]) => {
	const archiveMembers = members.filter((member) => member.trim().length > 0);
	if (!archiveMembers.length) {
		throw new Error("Backup archive is empty");
	}

	for (const member of archiveMembers) {
		validateWebServerArchiveMemberPath(member);
	}
};

export const restoreWebServerBackup = async (
	destination: Destination,
	backupFile: string,
	emit: (log: string) => void,
) => {
	if (IS_CLOUD) {
		return;
	}
	try {
		const { fileName, objectPath } = normalizeRestoreBackupFile(backupFile, [
			".zip",
		]);
		const safeDestination = await assertRcloneS3DestinationAllowed(destination);
		const backupPath = getRcloneS3Destination(safeDestination, objectPath);
		const { BASE_PATH } = paths();

		// Create a temporary directory outside of BASE_PATH
		const tempDir = await mkdtemp(join(tmpdir(), "dokploy-restore-"));
		const localBackupPath = join(tempDir, fileName);
		const databaseGzPath = join(tempDir, "database.sql.gz");
		const databaseSqlPath = join(tempDir, "database.sql");
		const filesystemPath = join(tempDir, "filesystem/");
		const basePath = BASE_PATH.replace(/\/+$/, "");
		const basePathWithSlash = `${basePath}/`;

		try {
			emit("Starting restore...");
			emit(`Backup path: ${backupPath}`);
			emit(`Temp directory: ${tempDir}`);

			// Create temp directory
			emit("Creating temporary directory...");
			await execAsync(`mkdir -p ${quoteRestoreShellArg(tempDir)}`);

			// Download backup from S3
			emit("Downloading backup from S3...");
			await execAsync(
				buildRcloneS3Command("copyto", safeDestination, [
					backupPath,
					localBackupPath,
				]),
			);

			// List files before extraction
			emit("Listing files before extraction...");
			const { stdout: beforeFiles } = await execAsync(
				`ls -la ${quoteRestoreShellArg(tempDir)}`,
			);
			emit(`Files before extraction: ${beforeFiles}`);

			// Validate archive member names before unzip can write any path.
			emit("Validating backup archive...");
			const { stdout: archiveListing } = await execAsync(
				`unzip -Z1 ${quoteRestoreShellArg(localBackupPath)}`,
			);
			validateWebServerArchiveMembers(archiveListing.split(/\r?\n/));
			const { stdout: unsupportedArchiveMembers } = await execAsync(
				`unzip -Z -l ${quoteRestoreShellArg(localBackupPath)} | awk '$1 ~ /^[lbcps]/ { print; exit }'`,
			);
			if (unsupportedArchiveMembers.trim()) {
				throw new Error(
					"Backup archive contains unsupported filesystem entries",
				);
			}

			// Extract backup
			emit("Extracting backup...");
			await execAsync(
				`cd ${quoteRestoreShellArg(tempDir)} && unzip ${quoteRestoreShellArg(fileName)} > /dev/null 2>&1`,
			);

			const { stdout: unsupportedArchiveEntries } = await execAsync(
				`find ${quoteRestoreShellArg(filesystemPath)} \\( -type l -o -type b -o -type c -o -type p -o -type s \\) -print -quit 2>/dev/null || true`,
			);
			if (unsupportedArchiveEntries.trim()) {
				throw new Error(
					"Backup archive contains unsupported filesystem entries",
				);
			}

			// Restore filesystem first
			emit("Restoring filesystem...");
			emit(`Copying from ${tempDir}/filesystem/* to ${BASE_PATH}/`);

			// First clean the target directory
			emit("Cleaning target directory...");
			await execAsync(`rm -rf ${quoteRestoreShellArg(basePathWithSlash)}*`);

			// Ensure the target directory exists
			emit("Setting up target directory...");
			await execAsync(`mkdir -p ${quoteRestoreShellArg(basePath)}`);

			// Copy files preserving permissions
			emit("Copying files...");
			await execAsync(
				`cp -rp ${quoteRestoreShellArg(filesystemPath)}* ${quoteRestoreShellArg(basePathWithSlash)}`,
			);

			// Now handle database restore
			emit("Starting database restore...");

			// Check if database.sql.gz exists and decompress it
			const { stdout: hasGzFile } = await execAsync(
				`ls ${quoteRestoreShellArg(databaseGzPath)} || true`,
			);
			if (hasGzFile.includes("database.sql.gz")) {
				emit("Found compressed database file, decompressing...");
				await execAsync(
					`cd ${quoteRestoreShellArg(tempDir)} && gunzip ${quoteRestoreShellArg("database.sql.gz")}`,
				);
			}

			// Verify database file exists
			const { stdout: hasSqlFile } = await execAsync(
				`ls ${quoteRestoreShellArg(databaseSqlPath)} || true`,
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
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} psql -U dokploy postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = 'dokploy' AND pid <> pg_backend_pid();"`,
			);

			emit("Dropping existing database...");
			await execAsync(
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} psql -U dokploy postgres -c "DROP DATABASE IF EXISTS dokploy;"`,
			);

			emit("Creating fresh database...");
			await execAsync(
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} psql -U dokploy postgres -c "CREATE DATABASE dokploy;"`,
			);

			// Copy the backup file into the container
			emit("Copying backup file into container...");
			await execAsync(
				`docker cp ${quoteRestoreShellArg(databaseSqlPath)} ${quoteRestoreShellArg(`${postgresContainerId}:/tmp/database.sql`)}`,
			);

			// Verify file in container
			emit("Verifying file in container...");
			await execAsync(
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} ls -l /tmp/database.sql`,
			);

			// Restore from the copied file
			emit("Running database restore...");
			await execAsync(
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} pg_restore -v -U dokploy -d dokploy /tmp/database.sql`,
			);

			// Cleanup the temporary file in the container
			emit("Cleaning up container temp file...");
			await execAsync(
				`docker exec ${quoteRestoreShellArg(postgresContainerId)} rm /tmp/database.sql`,
			);

			emit("Restore completed successfully!");
		} finally {
			// Cleanup
			emit("Cleaning up temporary files...");
			await execAsync(`rm -rf ${quoteRestoreShellArg(tempDir)}`);
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
