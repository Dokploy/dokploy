import { existsSync } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_TEST_TIMEOUT = 300000;

// Mock ONLY database and notifications
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { volumeBackups: { findFirst: vi.fn() } },
	},
}));

vi.mock("@dokploy/server/services/volume-backups", () => ({
	findVolumeBackupById: vi.fn(),
}));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentVolumeBackup: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

import type * as volumeBackupService from "@dokploy/server/services/volume-backups";
import { backupVolume } from "@dokploy/server/utils/volume-backups/backup";

type VolumeBackupData = Awaited<
	ReturnType<typeof volumeBackupService.findVolumeBackupById>
>;

const createMockDestination = () => ({
	destinationId: "test-dest",
	bucket: "test-bucket",
	accessKey: "key",
	secretAccessKey: "secret",
	region: "us-east-1",
	endpoint: "s3.amazonaws.com",
});

const createMockVolumeBackup = (volumeName: string, appName: string): any => ({
	volumeBackupId: "id",
	name: "Test",
	volumeName,
	appName,
	serviceType: "application",
	turnOff: false,
	prefix: "backups/",
	destination: createMockDestination() as any,
	application: { appName, serverId: null } as any,
	compose: null,
});

async function cleanupDocker(volumeName: string) {
	try {
		await execAsync(`docker volume rm ${volumeName} 2>/dev/null || true`);
		console.log(`✅ Cleaned up volume: ${volumeName}`);
	} catch {
		// Ignore
	}
}

async function cleanupFiles(appName: string) {
	try {
		const { LOGS_PATH, VOLUME_BACKUPS_PATH } = paths(false);

		// Clean logs
		const logPath = path.join(LOGS_PATH, appName);
		await execAsync(`rm -rf "${logPath}" 2>/dev/null || true`);

		// Clean volume backups directory
		const backupPath = path.join(VOLUME_BACKUPS_PATH, appName);
		await execAsync(`rm -rf "${backupPath}" 2>/dev/null || true`);

		console.log(`✅ Cleaned up files for ${appName}`);
	} catch (error) {
		console.error(`⚠️ Error during cleanup for ${appName}:`, error);
	}
}

describe(
	"Volume Backups - REAL Tests",
	() => {
		let currentVolumeName: string;
		let currentAppName: string;

		beforeEach(() => {
			vi.clearAllMocks();
			currentVolumeName = `test-vol-${Date.now()}`;
			currentAppName = `test-backup-${Date.now()}`;
		});

		afterEach(async () => {
			console.log(`\n🧹 Cleanup: ${currentVolumeName}`);
			await cleanupDocker(currentVolumeName);
			await cleanupFiles(currentAppName);

			// Clean all test volumes
			try {
				const { stdout } = await execAsync(
					`docker volume ls -q --filter "name=test-vol-" || true`,
				);
				if (stdout.trim()) {
					for (const vol of stdout.trim().split("\n")) {
						await execAsync(`docker volume rm ${vol} 2>/dev/null || true`);
					}
				}
			} catch {
				// Ignore
			}

			// Clean all test backup directories
			try {
				const { VOLUME_BACKUPS_PATH } = paths(false);
				await execAsync(
					`find "${VOLUME_BACKUPS_PATH}" -maxdepth 1 -type d -name "test-*" -exec rm -rf {} + 2>/dev/null || true`,
				);
			} catch {
				// Ignore
			}

			console.log("✅ Cleanup done\n");
		});

		it(
			"should backup volume with tar ",
			async () => {
				console.log(`\n🚀 Test backup: ${currentVolumeName}`);

				// Create volume with data
				await execAsync(`docker volume create ${currentVolumeName}`);
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "
						echo 'test' > /data/file.txt
						mkdir -p /data/dir
						echo 'nested' > /data/dir/nested.txt
					"
				`);
				console.log("✅ Volume created with data");

				// Backup using tar (simulating what backupVolume does)
				const backupVol = `backup-${Date.now()}`;
				await execAsync(`docker volume create ${backupVol}`);

				try {
					await execAsync(`
						docker run --rm -v ${currentVolumeName}:/source -v ${backupVol}:/backup ubuntu bash -c "
							cd /source && tar cf /backup/test.tar .
						"
					`);
					console.log("✅ Backup created");

					// Verify tar contains files
					const { stdout } = await execAsync(`
						docker run --rm -v ${backupVol}:/backup ubuntu tar -tf /backup/test.tar
					`);
					expect(stdout).toContain("file.txt");
					expect(stdout).toContain("dir/nested.txt");
					console.log("✅ Backup verified");
				} finally {
					await execAsync(`docker volume rm ${backupVol} 2>/dev/null || true`);
				}
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should verify backup command has proper logging",
			async () => {
				console.log(`\n🚀 Test logging: ${currentVolumeName}`);

				const mock = createMockVolumeBackup(currentVolumeName, currentAppName);
				const command = await backupVolume(mock);

				// Verify logging messages
				expect(command).toContain("Volume name:");
				expect(command).toContain("Starting volume backup");
				expect(command).toContain("Volume backup done ✅");
				expect(command).toContain("Upload to S3 done ✅");
				expect(command).toContain("tar cvf");

				console.log("✅ All log messages present");
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should backup 1GB volume using real backupVolume",
			async () => {
				console.log(
					`\n🚀 Test 1GB backup with real code: ${currentVolumeName}`,
				);

				// Create volume with ~1GB of data
				await execAsync(`docker volume create ${currentVolumeName}`);
				console.log("✅ Volume created");

				const startTime = Date.now();
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "
						echo 'Creating 1GB of test data...'
						dd if=/dev/zero of=/data/large-file-1.dat bs=1M count=250 2>/dev/null
						dd if=/dev/zero of=/data/large-file-2.dat bs=1M count=250 2>/dev/null
						dd if=/dev/zero of=/data/large-file-3.dat bs=1M count=250 2>/dev/null
						dd if=/dev/zero of=/data/large-file-4.dat bs=1M count=250 2>/dev/null
						mkdir -p /data/metadata
						echo 'Large backup test - Issue 3301' > /data/metadata/info.txt
						echo 'marker-67890' > /data/metadata/marker.txt
						du -sh /data
						ls -lh /data
					"
				`);
				const createTime = ((Date.now() - startTime) / 1000).toFixed(2);
				console.log(`✅ Created 1GB data in ${createTime}s`);

				// Create backup directory (simulating what Dokploy does)
				const { VOLUME_BACKUPS_PATH } = paths(false);
				const volumeBackupPath = path.join(VOLUME_BACKUPS_PATH, currentAppName);
				await execAsync(`mkdir -p "${volumeBackupPath}"`);

				// Use the REAL backupVolume function to generate the command
				const mock = createMockVolumeBackup(currentVolumeName, currentAppName);
				const fullCommand = await backupVolume(mock);

				console.log("📦 Executing REAL Dokploy backupVolume() command...");

				// Execute the REAL command (without S3 upload part)
				const backupStartTime = Date.now();
				const backupFileName = `${currentVolumeName}-${new Date().toISOString()}.tar`;

				// Extract and execute just the backup part of the command (tar creation)
				// This is what Dokploy really does
				const commandWithoutS3 =
					fullCommand?.replace(
						/rclone copyto[^\n]+/g,
						'echo "Skipping S3 upload - keeping file locally for test"',
					) || "";

				// Also prevent the cleanup of the backup file so we can verify it
				const commandWithoutCleanup = commandWithoutS3.replace(
					/rm "[^"]+\.tar"/g,
					'echo "Skipping cleanup for test verification"',
				);

				try {
					// Execute the real Dokploy backup command
					await execAsync(commandWithoutCleanup);
					const backupTime = ((Date.now() - backupStartTime) / 1000).toFixed(2);
					console.log(`✅ Backup executed in ${backupTime}s`);
				} catch (error: any) {
					console.error("Backup command failed:", error.message);
					throw error;
				}

				// Verify the backup file was actually created by Dokploy's command
				const { stdout: files } = await execAsync(
					`ls -lh "${volumeBackupPath}"`,
				);
				console.log(`Files in backup directory:\n${files}`);

				// Find the actual backup file created
				const { stdout: backupFiles } = await execAsync(
					`find "${volumeBackupPath}" -name "*.tar" -type f`,
				);
				const backupFilePath = backupFiles.trim().split("\n")[0];

				if (!backupFilePath) {
					throw new Error("No backup file found");
				}

				expect(existsSync(backupFilePath)).toBe(true);
				console.log(`✅ Backup file created: ${path.basename(backupFilePath)}`);

				// Verify file size
				const { stdout: statOutput } = await execAsync(
					`stat -f%z "${backupFilePath}" 2>/dev/null || stat -c%s "${backupFilePath}"`,
				);

				const sizeInMB = Number(statOutput.trim()) / (1024 * 1024);
				expect(sizeInMB).toBeGreaterThan(1000); // Should be > 1GB
				console.log(`✅ Backup file size: ${sizeInMB.toFixed(2)}MB`);

				// Verify tar contents - this proves the backup worked
				const { stdout: tarContents } = await execAsync(
					`tar -tf "${backupFilePath}"`,
				);
				console.log("📋 Tar contents preview (first 30 lines):");
				console.log(tarContents.split("\n").slice(0, 30).join("\n"));

				expect(tarContents).toContain("large-file-1.dat");
				expect(tarContents).toContain("large-file-2.dat");
				expect(tarContents).toContain("large-file-3.dat");
				expect(tarContents).toContain("large-file-4.dat");
				expect(tarContents).toContain("metadata/");

				// Extract and verify one file to ensure data integrity
				// First check if marker file exists in tar
				if (tarContents.includes("metadata/marker.txt")) {
					const tempDir = path.join(volumeBackupPath, "temp-extract");
					await execAsync(`mkdir -p "${tempDir}"`);
					await execAsync(
						`tar -xf "${backupFilePath}" -C "${tempDir}" metadata/marker.txt`,
					);
					const { stdout: markerContent } = await execAsync(
						`cat "${tempDir}/metadata/marker.txt"`,
					);
					expect(markerContent.trim()).toBe("marker-67890");
					await execAsync(`rm -rf "${tempDir}"`);
					console.log("✅ Data integrity verified");
				} else {
					// Alternative: extract entire metadata folder
					const tempDir = path.join(volumeBackupPath, "temp-extract");
					await execAsync(`mkdir -p "${tempDir}"`);
					await execAsync(`tar -xf "${backupFilePath}" -C "${tempDir}"`);

					// Check what was extracted
					const { stdout: extractedFiles } = await execAsync(
						`find "${tempDir}" -type f`,
					);
					console.log("Extracted files:", extractedFiles);

					// Verify marker file exists somewhere
					const markerFiles = extractedFiles
						.split("\n")
						.filter((f) => f.includes("marker.txt"));
					expect(markerFiles.length).toBeGreaterThan(0);

					const markerPath = markerFiles[0];
					const { stdout: markerContent } = await execAsync(
						`cat "${markerPath}"`,
					);
					expect(markerContent.trim()).toBe("marker-67890");
					await execAsync(`rm -rf "${tempDir}"`);
					console.log("✅ Data integrity verified (alternative path)");
				}

				console.log("\n📊 Performance Summary:");
				console.log(`   - Data creation: ${createTime}s`);
				console.log(`   - Size: ${sizeInMB.toFixed(2)}MB`);
				console.log(
					"✅ 1GB backup test PASSED - Real Dokploy backupVolume() works correctly",
				);
			},
			REAL_TEST_TIMEOUT,
		);
	},
	REAL_TEST_TIMEOUT,
);
