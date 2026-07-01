import path from "node:path";
import type { apiRestoreBackup } from "@dokploy/server/db/schema";
import type { Destination } from "@dokploy/server/services/destination";
import type { Libsql } from "@dokploy/server/services/libsql";
import type { z } from "zod";
import {
	assertRcloneS3DestinationAllowed,
	buildRcloneS3Command,
	getRcloneS3Destination,
	getServiceContainerCommand,
} from "../backups/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { normalizeRestoreBackupFile, quoteRestoreShellArg } from "./safe-input";

export const buildGzipTarArchivePolicyCommand = (localBackupPath: string) => {
	const quotedLocalBackupPath = quoteRestoreShellArg(localBackupPath);
	return `
		echo "Validating libsql backup archive..."
		gzip -dc ${quotedLocalBackupPath} | tar -tf - | awk '
			BEGIN { valid = 1 }
			{
				entry = $0
				if (entry == "" || entry ~ /^\\// || entry ~ /(^|\\/)\\.\\.(\\/|$)/ || entry ~ /\\\\/) {
					print "Unsafe archive member: " entry > "/dev/stderr"
					valid = 0
				}
			}
			END { exit valid ? 0 : 1 }
		'
		gzip -dc ${quotedLocalBackupPath} | tar -tvf - | awk '
			{
				mode = substr($1, 1, 1)
				if (mode != "-" && mode != "d") {
					print "Unsupported archive member: " $0 > "/dev/stderr"
					exit 1
				}
			}
		'
		echo "Libsql backup archive validation completed ✅"
	`;
};

export const restoreLibsqlBackup = async (
	libsql: Libsql,
	destination: Destination,
	backupInput: z.infer<typeof apiRestoreBackup>,
	emit: (log: string) => void,
) => {
	try {
		const { appName, serverId } = libsql;

		const { fileName, objectPath } = normalizeRestoreBackupFile(
			backupInput.backupFile,
			[".sql.gz"],
		);
		const safeDestination = await assertRcloneS3DestinationAllowed(destination);
		const backupPath = getRcloneS3Destination(safeDestination, objectPath);

		const tempDir = "/tmp/dokploy-libsql-restore";
		const localBackupPath = path.posix.join(tempDir, fileName);
		const quotedTempDir = quoteRestoreShellArg(tempDir);
		const quotedLocalBackupPath = quoteRestoreShellArg(localBackupPath);
		const rcloneCommand = buildRcloneS3Command("copyto", safeDestination, [
			backupPath,
			localBackupPath,
		]);

		const containerSearch = getServiceContainerCommand(appName);
		const restoreCommand = `cat ${quotedLocalBackupPath} | docker exec -i "$CONTAINER_ID" sh -c ${quoteRestoreShellArg("tar xzf - -C /var/lib/sqld")}`;

		const command = `
set -e
rm -rf ${quotedTempDir}
mkdir -p ${quotedTempDir}
CONTAINER_ID=$(${containerSearch})
${rcloneCommand}
${buildGzipTarArchivePolicyCommand(localBackupPath)}
${restoreCommand}
rm -rf ${quotedTempDir}
`;

		emit("Starting restore...");
		emit(`Restoring libsql from ${objectPath}`);

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}

		emit("Restore completed successfully!");
	} catch (error) {
		emit(
			`Error: ${
				error instanceof Error ? error.message : "Error restoring libsql backup"
			}`,
		);
		throw error;
	}
};
