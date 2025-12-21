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

		// afterEach(async () => {
		// 	console.log(`\n🧹 Cleanup: ${currentVolumeName}`);
		// 	await cleanupDocker(currentVolumeName);
		// 	await cleanupFiles(currentAppName);

		// 	// Clean all test volumes
		// 	try {
		// 		const { stdout } = await execAsync(
		// 			`docker volume ls -q --filter "name=test-vol-" || true`,
		// 		);
		// 		if (stdout.trim()) {
		// 			for (const vol of stdout.trim().split("\n")) {
		// 				await execAsync(`docker volume rm ${vol} 2>/dev/null || true`);
		// 			}
		// 		}
		// 	} catch {
		// 		// Ignore
		// 	}

		// 	// Clean all test backup directories
		// 	try {
		// 		const { VOLUME_BACKUPS_PATH } = paths(false);
		// 		await execAsync(
		// 			`find "${VOLUME_BACKUPS_PATH}" -maxdepth 1 -type d -name "test-*" -exec rm -rf {} + 2>/dev/null || true`,
		// 		);
		// 	} catch {
		// 		// Ignore
		// 	}

		// 	console.log("✅ Cleanup done\n");
		// });

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

		it(
			"should restore 15k files using real restoreVolume - Issue #3301",
			async () => {
				console.log(
					`\n🚀 Test 15k files restore with real code: ${currentVolumeName}`,
				);

				// Step 1: Create volume with 15,000 files
				await execAsync(`docker volume create ${currentVolumeName}`);
				console.log("✅ Volume created");

				const startTime = Date.now();
				console.log("📝 Creating 15,000 files...");
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c '
						mkdir -p /data/dir1 /data/dir2 /data/dir3 /data/dir4 /data/dir5
						
						# Create 3000 files in each directory
						for i in $(seq 1 3000); do
							echo "file content $i" > /data/dir1/file-$i.txt
						done
						
						for i in $(seq 1 3000); do
							echo "file content $i" > /data/dir2/file-$i.txt
						done
						
						for i in $(seq 1 3000); do
							echo "file content $i" > /data/dir3/file-$i.txt
						done
						
						for i in $(seq 1 3000); do
							echo "file content $i" > /data/dir4/file-$i.txt
						done
						
						for i in $(seq 1 3000); do
							echo "file content $i" > /data/dir5/file-$i.txt
						done
						
						echo "marker-15000" > /data/marker.txt
						echo "Total files created: $(find /data -type f | wc -l)"
						du -sh /data
					'
				`);
				const createTime = ((Date.now() - startTime) / 1000).toFixed(2);
				console.log(`✅ Created 15,000 files in ${createTime}s`);

				// Step 2: Create backup
				const { VOLUME_BACKUPS_PATH } = paths(false);
				const volumeBackupPath = path.join(
					VOLUME_BACKUPS_PATH,
					currentVolumeName,
				);
				await execAsync(`mkdir -p "${volumeBackupPath}"`);

				const backupFileName = `${currentVolumeName}-15k.tar`;

				const backupStartTime = Date.now();
				console.log("📦 Creating backup of 15k files...");
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/volume_data -v "${volumeBackupPath}":/backup ubuntu bash -c "
						cd /volume_data && tar cf /backup/${backupFileName} .
					"
				`);
				const backupTime = ((Date.now() - backupStartTime) / 1000).toFixed(2);
				console.log(`✅ Backup created in ${backupTime}s`);

				// Step 3: Remove original volume
				await execAsync(`docker volume rm ${currentVolumeName}`);
				console.log("✅ Removed original volume");

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

				console.log("📥 Executing REAL Dokploy restore for 15k files...");

				// Execute the REAL command
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
					console.log(`✅ 15k files restored in ${restoreTime}s`);
				} catch (error: any) {
					console.error("Restore command failed:", error.message);
					throw error;
				}

				// Step 5: Verify data integrity
				console.log("🔍 Verifying 15k restored files...");

				// Check marker file
				const { stdout: marker } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/marker.txt
				`);
				expect(marker.trim()).toBe("marker-15000");

				// Count restored files
				const { stdout: fileCount } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "find /data -type f | wc -l"
				`);
				const totalFiles = Number(fileCount.trim());
				expect(totalFiles).toBeGreaterThanOrEqual(15000);
				console.log(`✅ Verified ${totalFiles} files restored`);

				// Verify random files from different directories
				const { stdout: file1 } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/dir1/file-1500.txt
				`);
				expect(file1).toContain("file content");

				const { stdout: file2 } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/dir3/file-2000.txt
				`);
				expect(file2).toContain("file content");

				const { stdout: file3 } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/dir5/file-2500.txt
				`);
				expect(file3).toContain("file content");

				// Verify directory structure
				const { stdout: dirs } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu ls /data
				`);
				expect(dirs).toContain("dir1");
				expect(dirs).toContain("dir2");
				expect(dirs).toContain("dir3");
				expect(dirs).toContain("dir4");
				expect(dirs).toContain("dir5");

				// Verify volume exists
				const { stdout: volumeCheck } = await execAsync(
					`docker volume ls --filter name=${currentVolumeName} --format "{{.Name}}"`,
				);
				expect(volumeCheck.trim()).toBe(currentVolumeName);

				console.log("\n📊 Performance Summary:");
				console.log(`   - Creating 15k files: ${createTime}s`);
				console.log(`   - Backup: ${backupTime}s`);
				console.log(
					"✅ 15k files restore test PASSED - Real Dokploy code handles many files correctly",
				);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"should restore 10k files + 500MB folder - Combined stress test",
			async () => {
				console.log(
					`\n🚀 Test 10k files + 500MB restore: ${currentVolumeName}`,
				);

				// Step 1: Create volume with 10k files + 500MB
				await execAsync(`docker volume create ${currentVolumeName}`);
				console.log("✅ Volume created");

				const startTime = Date.now();
				console.log("📝 Creating 10,000 files + 500MB data...");
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c '
						# Create directory structure
						mkdir -p /data/small-files/batch1 /data/small-files/batch2
						mkdir -p /data/large-files
						
						# Create 5000 files in each batch (10k total)
						echo "Creating 10k small files..."
						for i in $(seq 1 5000); do
							echo "content-$i" > /data/small-files/batch1/file-$i.txt
						done
						
						for i in $(seq 1 5000); do
							echo "content-$i" > /data/small-files/batch2/file-$i.txt
						done
						
						# Create ~500MB of large files
						echo "Creating 500MB of large files..."
						dd if=/dev/zero of=/data/large-files/large-1.dat bs=1M count=125 2>/dev/null
						dd if=/dev/zero of=/data/large-files/large-2.dat bs=1M count=125 2>/dev/null
						dd if=/dev/zero of=/data/large-files/large-3.dat bs=1M count=125 2>/dev/null
						dd if=/dev/zero of=/data/large-files/large-4.dat bs=1M count=125 2>/dev/null
						
						# Create marker files
						echo "marker-combined-test" > /data/marker.txt
						echo "10k-files-500mb" > /data/test-type.txt
						
						echo "Summary:"
						echo "Total files: $(find /data -type f | wc -l)"
						echo "Total size: $(du -sh /data | cut -f1)"
					'
				`);
				const createTime = ((Date.now() - startTime) / 1000).toFixed(2);
				console.log(`✅ Created 10k files + 500MB in ${createTime}s`);

				// Step 2: Create backup
				const { VOLUME_BACKUPS_PATH } = paths(false);
				const volumeBackupPath = path.join(
					VOLUME_BACKUPS_PATH,
					currentVolumeName,
				);
				await execAsync(`mkdir -p "${volumeBackupPath}"`);

				const backupFileName = `${currentVolumeName}-combined.tar`;

				const backupStartTime = Date.now();
				console.log("📦 Creating backup of 10k files + 500MB...");
				await execAsync(`
					docker run --rm -v ${currentVolumeName}:/volume_data -v "${volumeBackupPath}":/backup ubuntu bash -c '
						cd /volume_data && tar cf /backup/${backupFileName} .
					'
				`);
				const backupTime = ((Date.now() - backupStartTime) / 1000).toFixed(2);
				console.log(`✅ Backup created in ${backupTime}s`);

				// Verify backup size
				const backupFilePath = path.join(volumeBackupPath, backupFileName);
				const { stdout: backupSize } = await execAsync(
					`stat -f%z "${backupFilePath}" 2>/dev/null || stat -c%s "${backupFilePath}"`,
				);
				const sizeInMB = Number(backupSize.trim()) / (1024 * 1024);
				console.log(`Backup size: ${sizeInMB.toFixed(2)}MB`);
				// Step 3: Remove original volume
				await execAsync(`docker volume rm ${currentVolumeName}`);
				console.log("✅ Removed original volume");

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

				console.log("📥 Executing REAL Dokploy restore for combined test...");

				// Execute the REAL command
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
					console.log(`✅ Combined restore executed in ${restoreTime}s`);
				} catch (error: any) {
					console.error("Restore command failed:", error.message);
					throw error;
				}

				// Step 5: Verify data integrity
				console.log("🔍 Verifying restored data...");

				// Check marker files
				const { stdout: marker } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/marker.txt
				`);
				expect(marker.trim()).toBe("marker-combined-test");

				const { stdout: testType } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/test-type.txt
				`);
				expect(testType.trim()).toBe("10k-files-500mb");

				// Count restored files
				const { stdout: fileCount } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "find /data -type f | wc -l"
				`);
				const totalFiles = Number(fileCount.trim());
				expect(totalFiles).toBeGreaterThanOrEqual(10000);
				console.log(`✅ Verified ${totalFiles} files restored`);

				// Verify random small files
				const { stdout: smallFile1 } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/small-files/batch1/file-2500.txt
				`);
				expect(smallFile1).toContain("content-2500");

				const { stdout: smallFile2 } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu cat /data/small-files/batch2/file-3000.txt
				`);
				expect(smallFile2).toContain("content-3000");

				// Verify large files exist
				const { stdout: largeFiles } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu ls -lh /data/large-files/
				`);
				expect(largeFiles).toContain("large-1.dat");
				expect(largeFiles).toContain("large-2.dat");
				expect(largeFiles).toContain("large-3.dat");
				expect(largeFiles).toContain("large-4.dat");

				// Verify large file size
				const { stdout: large1Size } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu bash -c "stat -c%s /data/large-files/large-1.dat 2>/dev/null || stat -f%z /data/large-files/large-1.dat"
				`);
				const fileSizeInMB = Number(large1Size.trim()) / (1024 * 1024);
				expect(fileSizeInMB).toBeGreaterThan(100); // Should be ~125MB
				console.log(
					`✅ Large file size verified: ${fileSizeInMB.toFixed(2)}MB`,
				);

				// Verify directory structure
				const { stdout: dirs } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu ls /data
				`);
				expect(dirs).toContain("small-files");
				expect(dirs).toContain("large-files");

				// Verify total volume size
				const { stdout: totalSize } = await execAsync(`
					docker run --rm -v ${currentVolumeName}:/data ubuntu du -sh /data
				`);
				console.log(`Restored volume size: ${totalSize.trim()}`);

				// Verify volume exists
				const { stdout: volumeCheck } = await execAsync(
					`docker volume ls --filter name=${currentVolumeName} --format "{{.Name}}"`,
				);
				expect(volumeCheck.trim()).toBe(currentVolumeName);

				console.log("\n📊 Performance Summary:");
				console.log(`   - Creating 10k files + 500MB: ${createTime}s`);
				console.log(`   - Backup: ${backupTime}s`);
				console.log(`   - Backup size: ${sizeInMB.toFixed(2)}MB`);
				console.log(
					"✅ Combined stress test PASSED - Real Dokploy code handles 10k files + 500MB correctly",
				);
			},
			REAL_TEST_TIMEOUT,
		);
	},
	REAL_TEST_TIMEOUT,
);
