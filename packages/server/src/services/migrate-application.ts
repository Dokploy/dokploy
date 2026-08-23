import { db } from "../db";
import type { Application } from "../db/schema";
import { findApplicationById, updateApplication } from "./application";
import {
	completeMigration,
	failMigration,
	findServiceMigrationById,
	updateServiceMigration,
	validateTargetServer,
} from "./service-migration";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { stopService, stopServiceRemote } from "../utils/docker/utils";
import { startService, startServiceRemote } from "../utils/docker/utils";

interface MigrationProgress {
	step: string;
	status: "pending" | "in_progress" | "completed" | "failed";
	message: string;
	timestamp: string;
}

/**
 * Main application migration orchestrator
 */
export const migrateApplication = async (
	applicationId: string,
	targetServerId: string,
	migrationId: string,
): Promise<void> => {
	const progress: MigrationProgress[] = [];
	let application: Application | null = null;
	let sourcePaused = false;
	let originalServerId: string | null = null;
	let originalApplicationStatus: Application["applicationStatus"] = "idle";

	const addProgress = (
		step: string,
		status: MigrationProgress["status"],
		message: string,
	) => {
		progress.push({
			step,
			status,
			message,
			timestamp: new Date().toISOString(),
		});
		updateServiceMigration(migrationId, {
			progress: JSON.stringify(progress),
			currentStep: step,
		}).catch(console.error);
	};

	const ensureMigrationActive = async () => {
		const migration = await findServiceMigrationById(migrationId);
		if (migration.status === "failed") {
			throw new Error(migration.errorMessage || "Migration cancelled");
		}
	};

	try {
		// Step 1: Validate source application
		addProgress(
			"validate_source",
			"in_progress",
			"Validating source application",
		);
		application = await findApplicationById(applicationId);

		if (!application) {
			throw new Error("Application not found");
		}

		originalServerId = application.serverId || null;
		originalApplicationStatus = application.applicationStatus;

		await ensureMigrationActive();

		addProgress("validate_source", "completed", "Source application validated");

		// Step 2: Validate target server
		addProgress(
			"validate_target",
			"in_progress",
			"Validating target server connectivity",
		);
		await updateServiceMigration(migrationId, { status: "validating" });
		await ensureMigrationActive();

		const validation = await validateTargetServer(targetServerId);
		if (!validation.valid) {
			throw new Error(validation.error || "Target server validation failed");
		}

		addProgress("validate_target", "completed", "Target server validated");

		// Step 3: Pause source application
		addProgress(
			"pause_source",
			"in_progress",
			"Pausing application on source server",
		);
		await updateServiceMigration(migrationId, { status: "pausing_source" });

		if (application.serverId) {
			await stopServiceRemote(application.serverId, application.appName);
		} else {
			await stopService(application.appName);
		}

		await updateApplication(applicationId, {
			applicationStatus: "idle",
		});
		sourcePaused = true;
		await ensureMigrationActive();

		addProgress("pause_source", "completed", "Application paused successfully");

		// Step 4: Backup volumes (if any)
		addProgress(
			"backup_volumes",
			"in_progress",
			"Backing up application volumes",
		);
		await updateServiceMigration(migrationId, { status: "backing_up" });

		const { volumes, unsupportedMounts } =
			await getApplicationMigrationMounts(application);

		if (unsupportedMounts.length > 0) {
			throw new Error(
				`Application contains unsupported mount types: ${unsupportedMounts.join(", ")}. Only volume mounts can be migrated automatically.`,
			);
		}

		const backedUpVolumes: string[] = [];

		if (volumes.length > 0) {
			for (const volume of volumes) {
				await ensureMigrationActive();
				try {
					await backupVolume(application.serverId || null, volume, migrationId);
					backedUpVolumes.push(volume);
				} catch (error) {
					throw error;
				}
			}

			await updateServiceMigration(migrationId, {
				volumesBackedUp: backedUpVolumes,
			});

			addProgress(
				"backup_volumes",
				"completed",
				`Backed up ${backedUpVolumes.length} volumes`,
			);
		} else {
			addProgress("backup_volumes", "completed", "No volumes to backup");
		}

		// Step 5: Transfer volumes to target server
		if (backedUpVolumes.length > 0) {
			addProgress(
				"transfer_volumes",
				"in_progress",
				"Transferring volumes to target server",
		);
		await updateServiceMigration(migrationId, { status: "transferring" });
		await ensureMigrationActive();

		for (const volume of backedUpVolumes) {
			await transferVolume(
				application.serverId || null,
					targetServerId,
					volume,
					migrationId,
				);
			}

			addProgress(
				"transfer_volumes",
				"completed",
				`Transferred ${backedUpVolumes.length} volumes`,
			);
		}

		// Step 6: Update application to point to new server
		addProgress(
			"update_application",
			"in_progress",
			"Updating application configuration",
		);
		await updateServiceMigration(migrationId, { status: "recreating" });
		await ensureMigrationActive();

		await updateApplication(applicationId, {
			serverId: targetServerId,
		});

		addProgress(
			"update_application",
			"completed",
			"Application configuration updated",
		);

		// Step 7: Restore volumes on target server
		if (backedUpVolumes.length > 0) {
			addProgress(
			"restore_volumes",
			"in_progress",
			"Restoring volumes on target server",
		);

		for (const volume of backedUpVolumes) {
			await ensureMigrationActive();
			await restoreVolume(targetServerId, volume, migrationId);
		}

			addProgress(
				"restore_volumes",
				"completed",
				`Restored ${backedUpVolumes.length} volumes`,
			);
		}

		// Step 8: Deploy application on target server
		await ensureMigrationActive();
		addProgress(
			"deploy_target",
			"in_progress",
			"Deploying application on target server",
		);

		// The application will be deployed when the user triggers a deploy
		// For now, we just update the status

		addProgress(
			"deploy_target",
			"completed",
			"Application ready for deployment on target server",
		);

		// Step 9: Mark migration as completed
		await completeMigration(migrationId);
		addProgress("complete", "completed", "Migration completed successfully");
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		addProgress("error", "failed", errorMessage);

		if (sourcePaused && originalServerId !== undefined) {
			try {
				await updateApplication(applicationId, {
					serverId: originalServerId,
					applicationStatus: originalApplicationStatus,
				});

				if (originalApplicationStatus === "done" && application) {
					if (originalServerId) {
						await startServiceRemote(originalServerId, application.appName);
					} else {
						await startService(application.appName);
					}
				}
			} catch (rollbackError) {
				console.error("Failed to roll back application after migration error:", rollbackError);
			}
		}

		await failMigration(migrationId, errorMessage);
		throw error;
	}
};

/**
 * Get volumes for an application and flag unsupported mounts.
 */
async function getApplicationMigrationMounts(
	application: Application,
): Promise<{ volumes: string[]; unsupportedMounts: string[] }> {
	const mounts = await db.query.mounts.findMany({
		where: (mounts, { eq }) =>
			eq(mounts.applicationId, application.applicationId),
	});

	const unsupportedMounts = mounts
		.filter((mount) => mount.type !== "volume")
		.map((mount) => mount.type);

	const volumes = mounts
		.filter((mount) => mount.type === "volume" && mount.volumeName)
		.map((mount) => mount.volumeName as string);

	return { volumes, unsupportedMounts };
}

/**
 * Backup a volume (create tar archive)
 */
async function backupVolume(
	serverId: string | null,
	volumeName: string,
	migrationId: string,
): Promise<void> {
	const backupPath = `/tmp/dokploy-migration-${migrationId}`;
	const tarFile = `${backupPath}/${volumeName}.tar.gz`;

	// Create backup directory
	const mkdirCmd = `mkdir -p ${backupPath}`;
	if (serverId) {
		await execAsyncRemote(serverId, mkdirCmd);
	} else {
		await execAsync(mkdirCmd);
	}

	// Create tar archive of volume
	const backupCmd = `docker run --rm -v ${volumeName}:/volume -v ${backupPath}:/backup alpine tar czf /backup/${volumeName}.tar.gz -C /volume .`;

	if (serverId) {
		await execAsyncRemote(serverId, backupCmd);
	} else {
		await execAsync(backupCmd);
	}
}

/**
 * Transfer volume from source to target server
 */
async function transferVolume(
	sourceServerId: string | null,
	targetServerId: string,
	volumeName: string,
	migrationId: string,
): Promise<void> {
	const backupPath = `/tmp/dokploy-migration-${migrationId}`;
	const tarFile = `${volumeName}.tar.gz`;

	if (sourceServerId) {
		await execAsync(`mkdir -p ${backupPath}`);

		// Transfer from remote source to remote target
		// Use rsync over SSH
		const sourceServer = await db.query.server.findFirst({
			where: (servers, { eq }) => eq(servers.serverId, sourceServerId),
		});

		const targetServer = await db.query.server.findFirst({
			where: (servers, { eq }) => eq(servers.serverId, targetServerId),
		});

		if (!sourceServer || !targetServer) {
			throw new Error("Server not found");
		}

		// This is a simplified approach - in production you'd want to use rsync or scp
		// For now, we'll download from source and upload to target
		const downloadCmd = `scp -i ~/.ssh/dokploy_key ${sourceServer.username}@${sourceServer.ipAddress}:${backupPath}/${tarFile} ${backupPath}/${tarFile}`;
		await execAsync(downloadCmd);

		await execAsyncRemote(targetServerId, `mkdir -p ${backupPath}`);
		const uploadCmd = `scp -i ~/.ssh/dokploy_key ${backupPath}/${tarFile} ${targetServer.username}@${targetServer.ipAddress}:${backupPath}/${tarFile}`;
		await execAsync(uploadCmd);
	} else {
		// Transfer from local to remote target
		const targetServer = await db.query.server.findFirst({
			where: (servers, { eq }) => eq(servers.serverId, targetServerId),
		});

		if (!targetServer) {
			throw new Error("Target server not found");
		}

		await execAsyncRemote(targetServerId, `mkdir -p ${backupPath}`);
		const uploadCmd = `scp -i ~/.ssh/dokploy_key ${backupPath}/${tarFile} ${targetServer.username}@${targetServer.ipAddress}:${backupPath}/${tarFile}`;
		await execAsync(uploadCmd);
	}
}

/**
 * Restore volume on target server
 */
async function restoreVolume(
	targetServerId: string,
	volumeName: string,
	migrationId: string,
): Promise<void> {
	const backupPath = `/tmp/dokploy-migration-${migrationId}`;
	const tarFile = `${backupPath}/${volumeName}.tar.gz`;

	// Create volume on target
	const createVolumeCmd = `docker volume create ${volumeName}`;
	await execAsyncRemote(targetServerId, createVolumeCmd);

	// Restore from tar archive
	const restoreCmd = `docker run --rm -v ${volumeName}:/volume -v ${backupPath}:/backup alpine sh -c "cd /volume && tar xzf /backup/${volumeName}.tar.gz"`;
	await execAsyncRemote(targetServerId, restoreCmd);

	// Cleanup backup file
	const cleanupCmd = `rm -f ${tarFile}`;
	await execAsyncRemote(targetServerId, cleanupCmd);
}
