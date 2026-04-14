import { paths } from "@dokploy/server/constants";
import path from "node:path";
import { findMountsByApplicationId } from "./mount";
import {
	compareFileLists,
	scanDirectory,
	scanMount,
} from "../utils/transfer/scanner";
import { runPreflightChecks } from "../utils/transfer/preflight";
import {
	syncDirectory,
	syncDockerVolume,
	syncMount,
	syncTraefikConfig,
} from "../utils/transfer/sync";
import type {
	ConflictDecision,
	MountTransferConfig,
	ServiceType,
	TransferOptions,
	TransferProgress,
	TransferResult,
	TransferScanResult,
} from "../utils/transfer/types";

const getServiceBasePath = (
	serviceType: ServiceType,
	appName: string,
	isRemote: boolean,
): string => {
	if (serviceType === "compose") {
		const { COMPOSE_PATH } = paths(isRemote);
		return path.join(COMPOSE_PATH, appName);
	}
	const { APPLICATIONS_PATH } = paths(isRemote);
	return path.join(APPLICATIONS_PATH, appName);
};

const hasServiceDirectory = (serviceType: ServiceType): boolean => {
	return serviceType === "application" || serviceType === "compose";
};

const getAutoDataVolumeName = (
	serviceType: ServiceType,
	appName: string,
): string | null => {
	const dbTypes: ServiceType[] = [
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
	];
	if (dbTypes.includes(serviceType)) {
		return `${appName}-data`;
	}
	return null;
};

export const scanServiceForTransfer = async (
	opts: TransferOptions,
): Promise<TransferScanResult> => {
	const { serviceType, appName, sourceServerId, targetServerId } = opts;

	const result: TransferScanResult = {
		serviceDirectory: { files: [], totalSize: 0 },
		traefikConfig: { exists: false, hasConflict: false },
		mounts: [],
		totalTransferSize: 0,
		totalFiles: 0,
		conflicts: [],
	};

	// 1. Scan service directory (application/compose only)
	if (hasServiceDirectory(serviceType)) {
		const sourcePath = getServiceBasePath(
			serviceType,
			appName,
			!!sourceServerId,
		);
		const targetPath = getServiceBasePath(serviceType, appName, true);

		try {
			const sourceFiles = await scanDirectory(sourceServerId, sourcePath);
			const targetFiles = await scanDirectory(targetServerId, targetPath);

			const fileConflicts = await compareFileLists(
				sourceFiles,
				targetFiles,
				sourceServerId,
				targetServerId,
				sourcePath,
			);

			result.serviceDirectory = {
				files: fileConflicts,
				totalSize: sourceFiles.reduce((sum, f) => sum + f.size, 0),
			};
		} catch {
			// Directory may not exist yet, that's ok
		}
	}

	// 2. Check Traefik config
	if (serviceType === "application" || serviceType === "compose") {
		const configPath = "/etc/dokploy/traefik/dynamic";
		const configFile = `${configPath}/${appName}.yml`;

		try {
			const sourceFiles = await scanDirectory(sourceServerId, configPath);
			const sourceConfig = sourceFiles.find(
				(f) => f.path === `${appName}.yml`,
			);
			if (sourceConfig) {
				result.traefikConfig.exists = true;
				const targetFiles = await scanDirectory(targetServerId, configPath);
				const targetConfig = targetFiles.find(
					(f) => f.path === `${appName}.yml`,
				);
				if (targetConfig) {
					result.traefikConfig.hasConflict = true;
				}
			}
		} catch {
			// Config may not exist
		}
	}

	// 3. Scan auto data volume for databases
	const autoVolume = getAutoDataVolumeName(serviceType, appName);
	if (autoVolume) {
		try {
			const sourceFiles = await scanMount(sourceServerId, {
				mountId: "auto",
				type: "volume",
				volumeName: autoVolume,
				mountPath: "/data",
			});
			const targetFiles = await scanMount(targetServerId, {
				mountId: "auto",
				type: "volume",
				volumeName: autoVolume,
				mountPath: "/data",
			});

			const fileConflicts = await compareFileLists(
				sourceFiles,
				targetFiles,
				sourceServerId,
				targetServerId,
				undefined,
				autoVolume,
			);

			result.mounts.push({
				mount: {
					mountId: "auto",
					type: "volume",
					volumeName: autoVolume,
					mountPath: "/data",
				},
				files: fileConflicts,
				totalSize: sourceFiles.reduce((sum, f) => sum + f.size, 0),
			});
		} catch {
			// Volume may not exist
		}
	}

	// 4. Scan user-defined mounts
	const serviceTypeForMount = serviceType as
		| "application"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "redis"
		| "compose";
	try {
		const userMounts = await findMountsByApplicationId(
			opts.serviceId,
			serviceTypeForMount,
		);

		for (const mount of userMounts) {
			const mountConfig: MountTransferConfig = {
				mountId: mount.mountId,
				type: mount.type,
				hostPath: mount.hostPath,
				volumeName: mount.volumeName,
				mountPath: mount.mountPath,
				content: mount.content,
				filePath: mount.filePath,
			};

			if (mount.type === "file") continue; // File mounts are DB-stored

			try {
				const sourceFiles = await scanMount(sourceServerId, mountConfig);
				const targetFiles = await scanMount(targetServerId, mountConfig);

				const fileConflicts = await compareFileLists(
					sourceFiles,
					targetFiles,
					sourceServerId,
					targetServerId,
					mount.type === "bind" ? mount.hostPath || undefined : undefined,
					mount.type === "volume" ? mount.volumeName || undefined : undefined,
				);

				result.mounts.push({
					mount: mountConfig,
					files: fileConflicts,
					totalSize: sourceFiles.reduce((sum, f) => sum + f.size, 0),
				});
			} catch {
				// Individual mount scan failure shouldn't stop entire scan
			}
		}
	} catch {
		// No mounts found
	}

	// Calculate totals
	result.totalTransferSize =
		result.serviceDirectory.totalSize +
		result.mounts.reduce((sum, m) => sum + m.totalSize, 0);

	result.totalFiles =
		result.serviceDirectory.files.length +
		result.mounts.reduce((sum, m) => sum + m.files.length, 0);

	result.conflicts = [
		...result.serviceDirectory.files,
		...result.mounts.flatMap((m) => m.files),
	].filter(
		(f) =>
			f.status !== "match" &&
			f.status !== "missing_target",
	);

	return result;
};

export const executeTransfer = async (
	opts: TransferOptions,
	decisions: Record<string, ConflictDecision>,
	onProgress?: (progress: TransferProgress) => void,
): Promise<TransferResult> => {
	const { serviceType, appName, sourceServerId, targetServerId } = opts;
	const errors: string[] = [];
	let processedFiles = 0;
	let transferredBytes = 0;

	const scan = await scanServiceForTransfer(opts);
	const totalFiles = scan.totalFiles;
	const totalBytes = scan.totalTransferSize;

	const reportProgress = (
		phase: TransferProgress["phase"],
		message?: string,
		currentFile?: string,
	) => {
		if (processedFiles > 0) {
			const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
			onProgress?.({
				phase,
				currentFile,
				processedFiles,
				totalFiles,
				transferredBytes,
				totalBytes,
				percentage,
				message,
			});
		} else {
			onProgress?.({
				phase,
				currentFile,
				processedFiles,
				totalFiles,
				transferredBytes,
				totalBytes,
				percentage: 0,
				message,
			});
		}
	};

	try {
		// Phase 1: Preflight checks
		reportProgress("preparing", "Running preflight checks...");

		const mountConfigs: MountTransferConfig[] = scan.mounts.map(
			(m) => m.mount,
		);
		const targetBasePath = getServiceBasePath(serviceType, appName, true);

		const preflight = await runPreflightChecks(
			targetServerId,
			targetBasePath,
			totalBytes,
			mountConfigs,
			(msg) => reportProgress("preparing", msg),
		);

		if (!preflight.passed) {
			return { success: false, errors: preflight.errors };
		}

		// Phase 2: Sync service directory
		if (hasServiceDirectory(serviceType)) {
			reportProgress("syncing_directory", "Syncing service directory...");

			const sourcePath = getServiceBasePath(
				serviceType,
				appName,
				!!sourceServerId,
			);

			try {
				await syncDirectory(
					sourceServerId,
					targetServerId,
					sourcePath,
					targetBasePath,
					(msg) => reportProgress("syncing_directory", msg),
				);
				processedFiles += scan.serviceDirectory.files.length;
				transferredBytes += scan.serviceDirectory.totalSize;
				reportProgress("syncing_directory", "Service directory synced");
			} catch (error) {
				errors.push(
					`Failed to sync service directory: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Phase 3: Sync Traefik config
		if (scan.traefikConfig.exists) {
			reportProgress("syncing_traefik", "Syncing Traefik configuration...");
			try {
				await syncTraefikConfig(
					sourceServerId,
					targetServerId,
					appName,
					(msg) => reportProgress("syncing_traefik", msg),
				);
				reportProgress("syncing_traefik", "Traefik config synced");
			} catch (error) {
				errors.push(
					`Failed to sync Traefik config: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Phase 4: Sync mounts
		reportProgress("syncing_mounts", "Syncing mounts and volumes...");
		for (const mountScan of scan.mounts) {
			const mountLabel =
				mountScan.mount.volumeName ||
				mountScan.mount.hostPath ||
				mountScan.mount.mountPath;
			reportProgress("syncing_mounts", `Syncing: ${mountLabel}`, mountLabel);

			try {
				await syncMount(
					sourceServerId,
					targetServerId,
					mountScan.mount,
					decisions,
					(msg) => reportProgress("syncing_mounts", msg),
				);
				processedFiles += mountScan.files.length;
				transferredBytes += mountScan.totalSize;
				reportProgress("syncing_mounts", `Completed: ${mountLabel}`);
			} catch (error) {
				errors.push(
					`Failed to sync mount ${mountLabel}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		if (errors.length > 0) {
			reportProgress("failed", `Transfer completed with errors: ${errors.join(", ")}`);
			return { success: false, errors };
		}

		reportProgress("completed", "Transfer completed successfully!");
		return { success: true, errors: [] };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		reportProgress("failed", `Transfer failed: ${message}`);
		return { success: false, errors: [message] };
	}
};
