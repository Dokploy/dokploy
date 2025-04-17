import type { BackupSchedule } from "@dokploy/server/services/backup";
import { execAsync } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";
import { findDestinationById } from "@dokploy/server/services/destination";
import { IS_CLOUD, paths } from "@dokploy/server/constants";

import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TOLERABLE_ZIP_EXIT_CODE = 18;
const TOLERABLE_ZIP_STDERR_MSG = "Not all files were readable";

export const runWebServerBackup = async (backup: BackupSchedule): Promise<boolean> => {
  let tempDir: string | null = null;

  try {
    if (IS_CLOUD) {
      console.log("Skipping web server backup in cloud environment.");
      return false;
    }

    console.log(`Starting backup for schedule ID: ${backup.id}`);

    const destination = await findDestinationById(backup.destinationId);
    if (!destination) {
      throw new Error(`Destination not found for ID: ${backup.destinationId}`);
    }

    console.log(`Using destination: ${destination.name} (Bucket: ${destination.bucket})`);

    const rcloneFlags = getS3Credentials(destination);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { BASE_PATH } = paths();

    tempDir = await mkdtemp(join(tmpdir(), "dokploy-backup-"));

    const backupFileName = `webserver-backup-${timestamp}.zip`;
    const s3Path = `:s3:${destination.bucket}/${normalizeS3Path(backup.prefix)}${backupFileName}`;

    const dbDumpPath = join(tempDir, "database.sql");
    const fsDirPath = join(tempDir, "filesystem");

    console.log(`Temporary directory created: ${tempDir}`);
    console.log(`Backup file name: ${backupFileName}`);
    console.log(`Target S3 path: ${s3Path}`);

    try {
      await execAsync(`mkdir -p ${fsDirPath}`);
      console.log(`Created filesystem directory: ${fsDirPath}`);

      console.log("Finding PostgreSQL container ID...");
      const { stdout: containerIdStdout } = await execAsync("docker ps --filter 'name=dokploy-postgres' -q");
      const containerId = containerIdStdout.trim();

      if (!containerId) {
        throw new Error("PostgreSQL container 'dokploy-postgres' not found");
      }

      console.log(`Found PostgreSQL container ID: ${containerId}`);

      const postgresCommand = `docker exec ${containerId} pg_dump -v -Fc -U dokploy -d dokploy > "${dbDumpPath}"`;

      console.log("Running pg_dump command...");
      await execAsync(postgresCommand);
      console.log(`Database dump saved to: ${dbDumpPath}`);

      const copyCommand = `cp -aT "${BASE_PATH}" "${fsDirPath}/"`;
      console.log(`Copying filesystem from ${BASE_PATH} to ${fsDirPath}/...`);
      await execAsync(copyCommand);
      console.log("Filesystem copy completed.");

      const zipFilePath = join(tempDir, backupFileName);
      const zipCommand = `cd "${tempDir}" && zip -r "${backupFileName}" database.sql filesystem/`;

      console.log(`Creating zip archive: ${zipFilePath}`);

      try {
        await execAsync(zipCommand);
        console.log(`Zip file created successfully: ${backupFileName}`);
      } catch (zipError: any) {
        if (zipError.code === TOLERABLE_ZIP_EXIT_CODE && zipError.stderr?.includes(TOLERABLE_ZIP_STDERR_MSG)) {
          console.warn(
            `Zip command finished with warnings (Exit Code: ${zipError.code}). Backup will proceed, but may be incomplete due to unreadable files.`,
          );
          console.warn("Zip stderr:", zipError.stderr);
        } else {
          console.error("Zip command failed with an unexpected error.");
          throw zipError;
        }
      }

      const uploadCommand = `rclone copyto ${rcloneFlags.join(" ")} "${zipFilePath}" "${s3Path}"`;
      console.log(`Uploading ${backupFileName} to S3 path: ${s3Path}`);
      await execAsync(uploadCommand);
      console.log("Backup upload completed successfully.");

      return true;
    } finally {
      if (tempDir) {
        console.log(`Cleaning up temporary directory: ${tempDir}`);
        try {
          await execAsync(`rm -rf "${tempDir}"`);
          console.log("Temporary directory cleaned up.");
        } catch (cleanupError: any) {
          console.error(`Failed to cleanup temporary directory ${tempDir}. Manual cleanup may be required.`, cleanupError);
        }
      }
    }
  } catch (error: any) {
    console.error("-----------------------------------------");
    console.error("--- Web Server Backup Process Failed! ---");
    console.error("-----------------------------------------");

    console.error("Timestamp:", new Date().toISOString());
    if (backup && backup.id) console.error("Backup Schedule ID:", backup.id);
    if (tempDir) console.error("Temporary Directory (may need manual cleanup):", tempDir);

    if (error.cmd) console.error("Failed Command:", error.cmd);
    if (error.stderr) console.error("Stderr:", `\n${error.stderr}`);
    if (error.stdout) console.error("Stdout:", `\n${error.stdout}`);
    if (error.code) console.error("Exit Code:", error.code);

    console.error("Full Error Object:", error);
    throw error;
  }
};
