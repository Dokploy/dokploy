import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_TEST_TIMEOUT = 300000;

// Mock ONLY database and services
vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

import * as applicationService from "@dokploy/server/services/application";
import * as destinationService from "@dokploy/server/services/destination";
import { restoreVolume } from "@dokploy/server/utils/volume-backups/restore";

const createMockDestination = () => ({
	destinationId: "test-dest",
	bucket: "test-bucket",
	accessKey: "key",
	secretAccessKey: "secret",
	region: "us-east-1",
	endpoint: "s3.amazonaws.com",
});

const createMockApplication = (appName: string) => ({
	applicationId: "test-app",
	appName,
	serverId: null,
});

async function cleanupDocker(volumeName: string, containerName?: string) {
	try {
		if (containerName) {
			await execAsync(`docker stop ${containerName} 2>/dev/null || true`);
			await execAsync(`docker rm ${containerName} 2>/dev/null || true`);
		}
		await execAsync(`docker volume rm ${volumeName} 2>/dev/null || true`);
		console.log(`✅ Cleaned up: ${volumeName}`);
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
	"Volume Restore - REAL Tests",
	() => {
		let currentVolumeName: string;
		let currentAppName: string;

		beforeEach(() => {
			vi.clearAllMocks();
			currentVolumeName = `test-vol-${Date.now()}`;
			currentAppName = `test-restore-${Date.now()}`;

			vi.mocked(destinationService.findDestinationById).mockResolvedValue(
				createMockDestination() as any,
			);
			vi.mocked(applicationService.findApplicationById).mockResolvedValue(
				createMockApplication(currentAppName) as any,
			);
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
			"should restore volume using real restoreVolume ",
			async () => {
				console.log(`\n🚀 Test restore with real code: ${currentVolumeName}`);

				// Step 1: Create volume with data
				await execAsync(`docker volume create ${currentVolumeName}`);
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "
						echo 'original' > /data/original.txt
						mkdir -p /data/subdir
						echo 'nested' > /data/subdir/file.txt
					"
				`);
				console.log("✅ Created volume with data");

				// Step 2: Create backup in the correct path (simulating what Dokploy does)
				const { VOLUME_BACKUPS_PATH } = paths(false);
				const volumeBackupPath = path.join(
					VOLUME_BACKUPS_PATH,
					currentVolumeName,
				);
				await execAsync(`mkdir -p "${volumeBackupPath}"`);

				const backupFileName = `${currentVolumeName}-2024-01-01T00:00:00.000Z.tar`;
				const backupFilePath = path.join(volumeBackupPath, backupFileName);

				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/volume_data -v "${volumeBackupPath}":/backup ubuntu bash -c "
						cd /volume_data && tar cf /backup/${backupFileName} .
					"
				`);
				console.log("✅ Backup created");

				// Step 3: Remove original volume
				await execAsync(`docker volume rm ${currentVolumeName}`);
				console.log("✅ Removed original");

				// Step 4: Use REAL restoreVolume function to generate the command
				const mockDestination = createMockDestination();
				const mockApplication = createMockApplication(currentAppName);

				vi.mocked(destinationService.findDestinationById).mockResolvedValue(
					mockDestination as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					mockApplication as any,
				);

				const fullCommand = await restoreVolume(
					mockApplication.applicationId,
					mockDestination.destinationId,
					currentVolumeName,
					backupFileName,
					"",
					"application",
				);

				console.log("📥 Executing REAL Dokploy restore command...");

				// Execute the REAL command, but skip S3 download since we already have the file
				// The command checks if volume exists, handles containers using it, and restores
				const restoreStartTime = Date.now();

				// Simulate the restore scenario: volume doesn't exist yet
				// The command will create it and restore from the backup file
				const commandWithoutS3 = fullCommand.replace(
					/rclone copyto[^\n]+/g,
					'echo "Skipping S3 download - file already present for test"',
				);

				try {
					await execAsync(commandWithoutS3);
					const restoreTime = ((Date.now() - restoreStartTime) / 1000).toFixed(
						2,
					);
					console.log(`✅ Restore command executed in ${restoreTime}s`);
				} catch (error: any) {
					console.error("Restore command failed:", error.message);
					throw error;
				}

				// Step 5: Verify data integrity - this proves the restore worked
				const { stdout } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "
						cat /data/original.txt && cat /data/subdir/file.txt
					"
				`);
				expect(stdout).toContain("original");
				expect(stdout).toContain("nested");
				console.log("✅ Data integrity verified after real restore");

				// Verify the volume actually exists
				const { stdout: volumeCheck } = await execAsync(
					`docker volume ls --filter name=${currentVolumeName} --format "{{.Name}}"`,
				);
				expect(volumeCheck.trim()).toBe(currentVolumeName);

				console.log(
					"✅ Restore test PASSED - Real Dokploy restoreVolume() works correctly",
				);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should detect volume in use during restore",
			async () => {
				console.log(`\n🚀 Test error detection: ${currentVolumeName}`);

				// Create volume with container using it
				await execAsync(`docker volume create ${currentVolumeName}`);

				const containerName = `test-container-${Date.now()}`;
				await execAsync(`
					docker run -d --name ${containerName} -v ${currentVolumeName}:/data ubuntu sleep 300
				`);
				console.log("✅ Container using volume");

				try {
					// Generate restore command
					const command = await restoreVolume(
						"test-app",
						"test-dest",
						currentVolumeName,
						"backup.tar",
						"",
						"application",
					);

					// Verify error detection messages for Issue #3301
					expect(command).toContain("CONTAINERS_USING_VOLUME=");
					expect(command).toContain(
						"Cannot restore volume as it is currently in use",
					);
					expect(command).toContain("Volume restore aborted");
					expect(command).toContain("Stop all containers/services");

					console.log("✅ Error detection verified");
				} finally {
					await execAsync(`docker stop ${containerName} 2>/dev/null || true`);
					await execAsync(`docker rm ${containerName} 2>/dev/null || true`);
				}
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should restore 1GB volume using real restoreVolume",
			async () => {
				console.log(
					`\n🚀 Test 1GB restore with real code: ${currentVolumeName}`,
				);

				// Step 1: Create volume with ~1GB of data
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
						echo 'Large restore test - Issue 3301' > /data/metadata/info.txt
						echo 'test-marker-12345' > /data/metadata/marker.txt
						du -sh /data
					"
				`);
				const createTime = ((Date.now() - startTime) / 1000).toFixed(2);
				console.log(`✅ Created 1GB data in ${createTime}s`);

				// Step 2: Create backup in the correct path
				const { VOLUME_BACKUPS_PATH } = paths(false);
				const volumeBackupPath = path.join(
					VOLUME_BACKUPS_PATH,
					currentVolumeName,
				);
				await execAsync(`mkdir -p "${volumeBackupPath}"`);

				const backupFileName = `${currentVolumeName}-large.tar`;
				const backupFilePath = path.join(volumeBackupPath, backupFileName);

				const backupStartTime = Date.now();
				console.log("📦 Creating backup of 1GB volume...");
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/volume_data -v "${volumeBackupPath}":/backup ubuntu bash -c "
						cd /volume_data && tar cf /backup/${backupFileName} .
					"
				`);
				const backupTime = ((Date.now() - backupStartTime) / 1000).toFixed(2);
				console.log(`✅ Backup created in ${backupTime}s`);

				// Step 3: Remove original volume
				await execAsync(`docker volume rm ${currentVolumeName}`);
				console.log("✅ Removed original 1GB volume");

				// Step 4: Use REAL restoreVolume function
				const mockDestination = createMockDestination();
				const mockApplication = createMockApplication(currentAppName);

				vi.mocked(destinationService.findDestinationById).mockResolvedValue(
					mockDestination as any,
				);
				vi.mocked(applicationService.findApplicationById).mockResolvedValue(
					mockApplication as any,
				);

				const fullCommand = await restoreVolume(
					mockApplication.applicationId,
					mockDestination.destinationId,
					currentVolumeName,
					backupFileName,
					"",
					"application",
				);

				console.log("📥 Executing REAL Dokploy restore for 1GB volume...");

				// Execute the REAL command, skipping S3 download
				const restoreStartTime = Date.now();
				const commandWithoutS3 = fullCommand.replace(
					/rclone copyto[^\n]+/g,
					'echo "Skipping S3 download - file already present for test"',
				);

				try {
					await execAsync(commandWithoutS3);
					const restoreTime = ((Date.now() - restoreStartTime) / 1000).toFixed(
						2,
					);
					console.log(`✅ 1GB restore command executed in ${restoreTime}s`);
				} catch (error: any) {
					console.error("Restore command failed:", error.message);
					throw error;
				}

				// Step 5: Verify data integrity on restored 1GB volume
				console.log("🔍 Verifying 1GB restored data...");

				// Check marker file
				const { stdout: marker } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/metadata/marker.txt
				`);
				expect(marker.trim()).toBe("test-marker-12345");

				// Check info file
				const { stdout: info } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/metadata/info.txt
				`);
				expect(info).toContain("Large restore test - Issue 3301");

				// Verify large files exist
				const { stdout: fileList } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu ls -lh /data
				`);
				expect(fileList).toContain("large-file-1.dat");
				expect(fileList).toContain("large-file-2.dat");
				expect(fileList).toContain("large-file-3.dat");
				expect(fileList).toContain("large-file-4.dat");

				// Verify total size
				const { stdout: sizeInfo } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu du -sh /data
				`);
				console.log(`Restored volume size: ${sizeInfo.trim()}`);

				// Verify volume exists
				const { stdout: volumeCheck } = await execAsync(
					`docker volume ls --filter name=${currentVolumeName} --format "{{.Name}}"`,
				);
				expect(volumeCheck.trim()).toBe(currentVolumeName);

				console.log("\n📊 Performance Summary:");
				console.log(`   - Data creation: ${createTime}s`);
				console.log(`   - Backup: ${backupTime}s`);
				console.log(
					"✅ 1GB restore test PASSED - Real Dokploy code handles large volumes correctly",
				);
			},
			REAL_TEST_TIMEOUT,
		);
	},
	REAL_TEST_TIMEOUT,
);
