import type { BackupSchedule } from "@dokploy/server/services/backup";
import { execAsync, type ExecResult } from "../process/execAsync";
import { getS3Credentials, normalizeS3Path } from "./utils";
import { findDestinationById } from "@dokploy/server/services/destination";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
const TOLERABLE_ZIP_EXIT_CODE = 18;
const TOLERABLE_ZIP_STDERR_MSG = "Not all files were readable";
const execAndLog = async (
  command: string,
  description: string
): Promise<ExecResult> => {
  console.log(`Executing: ${description}`);
  try {
    const result = await execAsync(command);
    console.log(`Success: ${description}`);
    return result;
  } catch (error: any) {
    console.error(`Failed: ${description}`);
    throw error;
  }
};
export const runWebServerBackup = async (
  backup: BackupSchedule
): Promise<boolean> => {
  let tempDir: string | null = null;
  const operationDescription = `Web Server Backup (ID: ${backup?.id || "N/A"})`;
  console.log(`\n--- Starting ${operationDescription} ---`);
  console.log("Timestamp:", new Date().toISOString());
  try {
    if (IS_CLOUD) {
      console.log("Skipping web server backup in Cloud environment.");
      return false;
    }
    if (!backup?.destinationId) {
      throw new Error("Backup schedule or destination ID is missing.");
    }
    const destination = await findDestinationById(backup.destinationId);
    if (!destination) {
      throw new Error(`Destination not found for ID: ${backup.destinationId}`);
    }
    console.log(
      `Found destination: ${destination.name} (Bucket: ${destination.bucket})`
    );
    const { BASE_PATH } = paths();
    if (!existsSync(BASE_PATH)) {
      throw new Error(`Base path for backup does not exist: ${BASE_PATH}`);
    }
    console.log(`Using base path: ${BASE_PATH}`);
    console.log("Creating temporary directory...");
    tempDir = await mkdtemp(join(tmpdir(), "dokploy-backup-ws-"));
    console.log(`Temporary directory created: ${tempDir}`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `webserver-backup-${timestamp}.zip`;
    const zipFilePath = join(tempDir, backupFileName);
    const dbDumpPath = join(tempDir, "database.sql");
    const fsDirPath = join(tempDir, "filesystem");
    await execAndLog(
      `mkdir -p "${fsDirPath}"`,
      "Create filesystem subdirectory in temp space"
    );
    console.log("Finding Dokploy PostgreSQL container...");
    const { stdout: containerIdStdout } = await execAndLog(
      `docker ps --filter "name=dokploy-postgres" --filter "status=running" -q | head -n 1`,
      "Get PostgreSQL container ID"
    );
    const containerId = containerIdStdout.trim();
    if (!containerId) {
      throw new Error(
        "Running PostgreSQL container 'dokploy-postgres' not found."
      );
    }
    console.log(`Found PostgreSQL container ID: ${containerId}`);
    const postgresCommand = `docker exec "${containerId}" pg_dump -v -Fc -U dokploy -d dokploy > "${dbDumpPath}"`;
    await execAndLog(postgresCommand, "Dump PostgreSQL database");
    const copyCommand = `cp -aT "${BASE_PATH}" "${fsDirPath}/"`;
    await execAndLog(copyCommand, "Copy application filesystem");
    const zipCommand = `cd "${tempDir}" && zip -r "${backupFileName}" database.sql filesystem/`;
    console.log(`Executing: Zip backup contents`);
    try {
      await execAsync(zipCommand);
      console.log(`Success: Zip backup contents`);
    } catch (zipError: any) {
      if (
        zipError.code === TOLERABLE_ZIP_EXIT_CODE &&
        zipError.stderr?.includes(TOLERABLE_ZIP_STDERR_MSG)
      ) {
        console.warn("-----------------------------------------");
        console.warn("--- Zip Command Completed with Warnings ---");
        console.warn("-----------------------------------------");
        console.warn(
          `Zip command finished with known tolerable warnings (Exit Code: ${zipError.code}). Backup will proceed, but may be incomplete due to unreadable files (e.g., sockets, FIFOs).`
        );
        console.warn("Zip stderr:", `\n${zipError.stderr}`);
      } else {
        console.error("------------------------------------");
        console.error("--- Zip Command Failed Unexpectedly ---");
        console.error("------------------------------------");
        throw zipError;
      }
    }
    const rcloneFlags = getS3Credentials(destination);
    const s3Path = `:s3:${destination.bucket}/${normalizeS3Path(
      backup.prefix
    )}${backupFileName}`;
    const uploadCommand = `rclone copyto -v ${rcloneFlags.join(
      " "
    )} "${zipFilePath}" "${s3Path}"`;
    await execAndLog(uploadCommand, `Upload backup to S3 (${s3Path})`);
    console.log(`--- ${operationDescription} Completed Successfully ---`);
    return true;
  } catch (error: any) {
    console.error(`### ${operationDescription} FAILED! ###`);
    console.error("Timestamp:", new Date().toISOString());
    if (backup?.id) console.error("Backup Schedule ID:", backup.id);
    if (tempDir)
      console.error("Temporary Directory (may need manual cleanup):", tempDir);
    if (error.cmd) console.error("Failed Command:", error.cmd);
    if (error.stderr) console.error("Stderr:", `\n${error.stderr.trim()}`);
    if (error.stdout) console.error("Stdout:", `\n${error.stdout.trim()}`);
    if (error.code !== undefined) console.error("Exit Code:", error.code);
    console.error("Full Error Details:", error);
    console.error("Stack Trace:", error.stack || "Not available");
    return false;
  } finally {
    if (tempDir) {
      console.log(`Attempting cleanup of temporary directory: ${tempDir}`);
      try {
        await execAsync(`rm -rf "${tempDir}"`);
        console.log(`Successfully cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError: any) {
        console.error(`!!! FAILED TO CLEANUP TEMP DIR: ${tempDir} !!!`);
        console.error("!!! Manual cleanup may be required. !!!");
        console.error("Cleanup Error Command:", cleanupError.cmd);
        console.error("Cleanup Error Stderr:", cleanupError.stderr);
        console.error("Cleanup Error Code:", cleanupError.code);
        console.error("Cleanup Full Error:", cleanupError);
      }
    }
    console.log(`--- ${operationDescription} Finalizing ---`);
  }
};
