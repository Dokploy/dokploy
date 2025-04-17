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
      return false;
    }
    const destination = await findDestinationById(backup.destinationId);
    if (!destination) {
      throw new Error(`Destination not found for ID: ${backup.destinationId}`);
    }
    const rcloneFlags = getS3Credentials(destination);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { BASE_PATH } = paths();
    tempDir = await mkdtemp(join(tmpdir(), "dokploy-backup-"));
    const backupFileName = `webserver-backup-${timestamp}.zip`;
    const s3Path = `:s3:${destination.bucket}/${normalizeS3Path(backup.prefix)}${backupFileName}`;
    const dbDumpPath = join(tempDir, "database.sql");
    const fsDirPath = join(tempDir, "filesystem");
    
    try {
      await execAsync(`mkdir -p ${fsDirPath}`);
      const { stdout: containerIdStdout } = await execAsync("docker ps --filter 'name=dokploy-postgres' -q");
      const containerId = containerIdStdout.trim();
      
      if (!containerId) {
        throw new Error("PostgreSQL container 'dokploy-postgres' not found");
      }
      
      const postgresCommand = `docker exec ${containerId} pg_dump -v -Fc -U dokploy -d dokploy > "${dbDumpPath}"`;
      await execAsync(postgresCommand);
      const copyCommand = `cp -aT "${BASE_PATH}" "${fsDirPath}/"`;
      await execAsync(copyCommand);
      const zipFilePath = join(tempDir, backupFileName);
      const zipCommand = `cd "${tempDir}" && zip -r "${backupFileName}" database.sql filesystem/`;
      
      try {
        await execAsync(zipCommand);
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
      await execAsync(uploadCommand);
      return true;
    } finally {
      if (tempDir) {
        try {
          await execAsync(`rm -rf "${tempDir}"`);
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
