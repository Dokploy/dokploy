import { paths } from "@dokploy/server/constants";
import path from "node:path";
import { findMountsByApplicationId } from "./mount";
import {
	compareFileLists,
	getDirectorySize,
	getVolumeSize,
	listComposeVolumes,
	listVolumesByPrefix,
	scanDirectory,
	scanDockerVolume,
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

/**
 * Discover all Docker volumes for a service.
 * For compose: uses Docker labels + prefix matching.
 * For databases: uses the auto {appName}-data convention.
 * For applications: uses user-defined mounts only.
 */
const discoverServiceVolumes = async (
	serverId: string | null,
	serviceType: ServiceType,
	appName: string,
): Promise<string[]> => {
	const volumes: Set<string> = new Set();

	if (serviceType === "compose") {
		// Get volumes by compose project label
		const labelVolumes = await listComposeVolumes(serverId, appName);
		for (const v of labelVolumes) {
			volumes.add(v);
		}

		// Also try prefix matching (compose uses {projectName}_{volumeName} pattern)
		const prefixVolumes = await listVolumesByPrefix(serverId, `${appName}_`);
		for (const v of prefixVolumes) {
			volumes.add(v);
		}
	}

	// Auto data volume for databases
	const autoVolume = getAutoDataVolumeName(serviceType, appName);
	if (autoVolume) {
		volumes.add(autoVolume);
	}

	return Array.from(volumes);
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

		const sourceFiles = await scanDirectory(sourceServerId, sourcePath);
		const targetFiles = await scanDirectory(targetServerId, targetPath);
		const dirSize = await getDirectorySize(sourceServerId, sourcePath);

		const fileConflicts = compareFileLists(sourceFiles, targetFiles);

		result.serviceDirectory = {
			files: fileConflicts,
			totalSize: dirSize || sourceFiles.reduce((sum, f) => sum + f.size, 0),
		};
	}

	// 2. Check Traefik config
	if (serviceType === "application" || serviceType === "compose") {
		const { DYNAMIC_TRAEFIK_PATH } = paths(!!sourceServerId);
		const configFile = `${appName}.yml`;
		const sourceConfigFiles = await scanDirectory(
			sourceServerId,
			DYNAMIC_TRAEFIK_PATH,
		);
		const hasSourceConfig = sourceConfigFiles.some(
			(f) => f.path === configFile,
		);

		if (hasSourceConfig) {
			result.traefikConfig.exists = true;
			const { DYNAMIC_TRAEFIK_PATH: targetTraefikPath } = paths(true);
			const targetConfigFiles = await scanDirectory(
				targetServerId,
				targetTraefikPath,
			);
			result.traefikConfig.hasConflict = targetConfigFiles.some(
				(f) => f.path === configFile,
			);
		}
	}

	// 3. Discover and scan ALL Docker volumes for the service
	const discoveredVolumes = await discoverServiceVolumes(
		sourceServerId,
		serviceType,
		appName,
	);

	for (const volumeName of discoveredVolumes) {
		const sourceFiles = await scanDockerVolume(sourceServerId, volumeName);
		const targetFiles = await scanDockerVolume(targetServerId, volumeName);
		const volSize = await getVolumeSize(sourceServerId, volumeName);

		const fileConflicts = compareFileLists(sourceFiles, targetFiles);

		result.mounts.push({
			mount: {
				mountId: `docker-${volumeName}`,
				type: "volume",
				volumeName,
				mountPath: "/data",
			},
			files: fileConflicts,
			totalSize: volSize || sourceFiles.reduce((sum, f) => sum + f.size, 0),
		});
	}

	// 4. Scan user-defined mounts from Dokploy DB
	const serviceTypeForMount = serviceType as
		| "application"
		| "postgres"
		| "mysql"
		| "mariadb"
		| "mongo"
		| "redis"
		| "compose";

	const userMounts = await findMountsByApplicationId(
		opts.serviceId,
		serviceTypeForMount,
	);

	for (const mount of userMounts) {
		if (mount.type === "file") continue;

		// Skip if already discovered as Docker volume
		if (
			mount.type === "volume" &&
			mount.volumeName &&
			discoveredVolumes.includes(mount.volumeName)
		) {
			continue;
		}

		const mountConfig: MountTransferConfig = {
			mountId: mount.mountId,
			type: mount.type,
			hostPath: mount.hostPath,
			volumeName: mount.volumeName,
			mountPath: mount.mountPath,
			content: mount.content,
			filePath: mount.filePath,
		};

		const sourceFiles = await scanMount(sourceServerId, mountConfig);
		const targetFiles = await scanMount(targetServerId, mountConfig);

		let mountSize = 0;
		if (mount.type === "volume" && mount.volumeName) {
			mountSize = await getVolumeSize(sourceServerId, mount.volumeName);
		} else if (mount.type === "bind" && mount.hostPath) {
			mountSize = await getDirectorySize(sourceServerId, mount.hostPath);
		}

		const fileConflicts = compareFileLists(sourceFiles, targetFiles);

		result.mounts.push({
			mount: mountConfig,
			files: fileConflicts,
			totalSize: mountSize || sourceFiles.reduce((sum, f) => sum + f.size, 0),
		});
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
	].filter((f) => f.status !== "match" && f.status !== "missing_target");

	return result;
};

export const executeTransfer = async (
	opts: TransferOptions,
	decisions: Record<string, ConflictDecision>,
	onProgress?: (progress: TransferProgress) => void,
): Promise<TransferResult> => {
	const { serviceType, appName, sourceServerId, targetServerId } = opts;
	const errors: string[] = [];
	const processedFiles = 0;
	const transferredBytes = 0;

	const reportProgress = (
		phase: TransferProgress["phase"],
		message?: string,
		currentFile?: string,
	) => {
		onProgress?.({
			phase,
			currentFile,
			processedFiles,
			totalFiles: 0,
			transferredBytes,
			totalBytes: 0,
			percentage: 0,
			message,
		});
	};

	try {
		// Phase 1: Preflight
		reportProgress("preparing", "Running preflight checks...");

		// Discover all volumes
		const discoveredVolumes = await discoverServiceVolumes(
			sourceServerId,
			serviceType,
			appName,
		);

		// User-defined mounts
		const mountConfigs: MountTransferConfig[] = [];
		const serviceTypeForMount = serviceType as
			| "application"
			| "postgres"
			| "mysql"
			| "mariadb"
			| "mongo"
			| "redis"
			| "compose";

		const userMounts = await findMountsByApplicationId(
			opts.serviceId,
			serviceTypeForMount,
		);

		for (const mount of userMounts) {
			if (mount.type === "file") continue;
			if (
				mount.type === "volume" &&
				mount.volumeName &&
				discoveredVolumes.includes(mount.volumeName)
			) {
				continue; // Will be handled as discovered volume
			}
			mountConfigs.push({
				mountId: mount.mountId,
				type: mount.type,
				hostPath: mount.hostPath,
				volumeName: mount.volumeName,
				mountPath: mount.mountPath,
				content: mount.content,
				filePath: mount.filePath,
			});
		}

		const allVolumeConfigs: MountTransferConfig[] = [
			...discoveredVolumes.map((v) => ({
				mountId: `docker-${v}`,
				type: "volume" as const,
				volumeName: v,
				mountPath: "/data",
			})),
			...mountConfigs,
		];

		const targetBasePath = getServiceBasePath(serviceType, appName, true);

		const preflight = await runPreflightChecks(
			targetServerId,
			targetBasePath,
			0,
			allVolumeConfigs,
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
				reportProgress("syncing_directory", "Service directory synced");
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`Failed to sync service directory: ${msg}`);
				reportProgress("syncing_directory", `Error: ${msg}`);
			}
		}

		// Phase 3: Sync Traefik config
		if (serviceType === "application" || serviceType === "compose") {
			reportProgress("syncing_traefik", "Syncing Traefik configuration...");
			try {
				await syncTraefikConfig(
					sourceServerId,
					targetServerId,
					appName,
					(msg) => reportProgress("syncing_traefik", msg),
				);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`Failed to sync Traefik config: ${msg}`);
				reportProgress("syncing_traefik", `Error: ${msg}`);
			}
		}

		// Phase 4: Sync all discovered Docker volumes
		reportProgress("syncing_mounts", "Syncing Docker volumes...");

		for (const volumeName of discoveredVolumes) {
			reportProgress("syncing_mounts", `Syncing volume: ${volumeName}`);
			try {
				await syncDockerVolume(
					sourceServerId,
					targetServerId,
					volumeName,
					(msg) => reportProgress("syncing_mounts", msg),
				);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`Failed to sync volume ${volumeName}: ${msg}`);
				reportProgress("syncing_mounts", `Error: ${msg}`);
			}
		}

		// Phase 5: Sync user-defined mounts (bind mounts, etc.)
		for (const mountConfig of mountConfigs) {
			const mountLabel =
				mountConfig.volumeName || mountConfig.hostPath || mountConfig.mountPath;
			reportProgress("syncing_mounts", `Syncing: ${mountLabel}`);

			try {
				await syncMount(
					sourceServerId,
					targetServerId,
					mountConfig,
					decisions,
					(msg) => reportProgress("syncing_mounts", msg),
				);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				errors.push(`Failed to sync mount ${mountLabel}: ${msg}`);
				reportProgress("syncing_mounts", `Error: ${msg}`);
			}
		}

		if (errors.length > 0) {
			reportProgress(
				"failed",
				`Transfer completed with errors: ${errors.join(", ")}`,
			);
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
