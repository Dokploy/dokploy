/**
 * Transfer Service — orchestrates scanning and syncing for service migration
 */
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { findComposeById } from "@dokploy/server/services/compose";
import { findMountsByApplicationId } from "@dokploy/server/services/mount";
import {
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import {
	readConfig,
	readRemoteConfig,
	writeConfig,
	writeConfigRemote,
} from "@dokploy/server/utils/traefik/application";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { shellEscape } from "../utils/process/ssh";
import {
	createDirectoryOnTarget,
	createVolumeOnTarget,
} from "../utils/transfer/preflight";
import {
	compareFileLists,
	computeFileHash,
	scanBindMount,
	scanVolume,
} from "../utils/transfer/scanner";
import {
	buildDecisionKey,
	shouldSyncFile,
	syncMount,
	syncVolumeArchive,
} from "../utils/transfer/sync";
import type {
	FileCompareResult,
	MountTransferConfig,
	ServiceType,
} from "../utils/transfer/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransferOptions {
	serviceId: string;
	serviceType: ServiceType;
	appName: string;
	sourceServerId: string | null; // null = local/main server
	targetServerId: string | null; // null = local/main server
}

export interface VolumeScanResult {
	volumeName: string;
	mountPath: string;
	sizeBytes: number;
	files: FileCompareResult[];
}

export interface BindScanResult {
	hostPath: string;
	files: FileCompareResult[];
}

export interface TransferScanResult {
	serviceDir?: {
		path: string;
		files: FileCompareResult[];
	};
	traefikConfig?: {
		sourceExists: boolean;
		targetExists: boolean;
		hasConflict: boolean;
		sourceContent?: string;
		targetContent?: string;
	};
	volumes: VolumeScanResult[];
	binds: BindScanResult[];
	totalSizeBytes: number;
	conflicts: FileCompareResult[];
	hasConflicts: boolean;
}

export interface TransferProgress {
	phase: string;
	currentFile?: string;
	processedFiles: number;
	totalFiles: number;
	transferredBytes: number;
	totalBytes: number;
	percentage: number;
}

export interface TransferScanProgress {
	phase: string;
	mount?: string;
	currentFile?: string;
	processedMounts: number;
	totalMounts: number;
	scannedFiles: number;
	processedHashes: number;
	totalHashes: number;
}

interface ResolvedMountTransferConfig extends MountTransferConfig {
	mountPath?: string;
	composeProjectName?: string;
	composeVolumeKey?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the service directory path (only for application/compose)
 */
function getServiceDirPath(
	serviceType: ServiceType,
	appName: string,
): string | null {
	const { APPLICATIONS_PATH, COMPOSE_PATH } = paths(true);
	if (serviceType === "application") {
		return `${APPLICATIONS_PATH}/${appName}`;
	}
	if (serviceType === "compose") {
		return `${COMPOSE_PATH}/${appName}`;
	}
	return null;
}

function getServiceDirMountId(
	serviceType: ServiceType,
	serviceId: string,
): string {
	return `service-dir:${serviceType}:${serviceId}`;
}

/**
 * Check if a service type has Traefik config
 */
function hasTraefikConfig(serviceType: ServiceType): boolean {
	return serviceType === "application" || serviceType === "compose";
}

/**
 * Build MountTransferConfig from DB mounts
 */
function buildMountConfigs(
	dbMounts: Awaited<ReturnType<typeof findMountsByApplicationId>>,
): ResolvedMountTransferConfig[] {
	return dbMounts
		.filter((m) => m.type === "volume" || m.type === "bind")
		.map((m) => ({
			mountId: m.mountId,
			mountType: m.type as "volume" | "bind",
			sourcePath: m.type === "volume" ? m.volumeName || "" : m.hostPath || "",
			targetPath: m.type === "volume" ? m.volumeName || "" : m.hostPath || "",
			createIfMissing: true,
			updateMountConfig: false,
			mountPath: m.mountPath,
		}));
}

function getMountDedupeKey(mount: MountTransferConfig): string {
	return `${mount.mountType}:${mount.sourcePath}`;
}

function hasUnresolvedVariable(value: string): boolean {
	return value.includes("${") || value.startsWith("$");
}

function isLikelyBindSource(source: string): boolean {
	return (
		source.startsWith("/") ||
		source.startsWith("./") ||
		source.startsWith("../") ||
		source === "." ||
		source === ".." ||
		source.startsWith("~/")
	);
}

function isPathInside(pathToCheck: string, parentPath: string): boolean {
	const normalizedPath = path.resolve(pathToCheck);
	const normalizedParent = path.resolve(parentPath);
	return (
		normalizedPath === normalizedParent ||
		normalizedPath.startsWith(`${normalizedParent}${path.sep}`)
	);
}

function parseComposeVolumeString(volume: string): {
	source?: string;
	target?: string;
} {
	const parts = volume.split(":");
	if (parts.length < 2) {
		// Anonymous volume (`/var/lib/data`) has no host/source to transfer.
		return { target: parts[0] };
	}
	const source = parts[0];
	const target = parts[1];
	return { source, target };
}

interface ResolvedComposeVolume {
	volumeName: string;
	volumeKey: string;
	external: boolean;
}

function resolveComposeVolume(
	source: string,
	appName: string,
	composeSpec: ComposeSpecification,
): ResolvedComposeVolume | null {
	if (hasUnresolvedVariable(source) || isLikelyBindSource(source)) {
		return null;
	}

	// Handle cases like "db-data/subdir:/target" by using the root volume key.
	const [volumeKey] = source.split("/");
	if (!volumeKey) return null;

	const volumeDef = composeSpec.volumes?.[volumeKey];
	if (!volumeDef || typeof volumeDef !== "object") {
		return {
			volumeName: `${appName}_${volumeKey}`,
			volumeKey,
			external: false,
		};
	}

	if (volumeDef.external) {
		if (
			typeof volumeDef.external === "object" &&
			typeof volumeDef.external.name === "string" &&
			volumeDef.external.name.length > 0
		) {
			return {
				volumeName: volumeDef.external.name,
				volumeKey,
				external: true,
			};
		}
		return {
			volumeName: volumeKey,
			volumeKey,
			external: true,
		};
	}

	if (typeof volumeDef.name === "string" && volumeDef.name.length > 0) {
		return {
			volumeName: volumeDef.name,
			volumeKey,
			external: false,
		};
	}

	return {
		volumeName: `${appName}_${volumeKey}`,
		volumeKey,
		external: false,
	};
}

function addResolvedMount(
	list: ResolvedMountTransferConfig[],
	seen: Set<string>,
	mount: ResolvedMountTransferConfig,
) {
	const dedupeKey = getMountDedupeKey(mount);
	if (seen.has(dedupeKey)) return;
	seen.add(dedupeKey);
	list.push(mount);
}

function getComposeManagedVolumeLabels(
	mount: ResolvedMountTransferConfig,
): Record<string, string> | undefined {
	if (
		mount.mountType !== "volume" ||
		!mount.composeProjectName ||
		!mount.composeVolumeKey
	) {
		return undefined;
	}

	return {
		"com.docker.compose.project": mount.composeProjectName,
		"com.docker.compose.volume": mount.composeVolumeKey,
	};
}

function extractComposeSpecMounts(
	composeSpec: ComposeSpecification,
	appName: string,
	serviceDirPath: string,
	composeBaseDir: string,
	seen: Set<string>,
): ResolvedMountTransferConfig[] {
	const mounts: ResolvedMountTransferConfig[] = [];
	const services = composeSpec.services || {};

	for (const service of Object.values(services)) {
		const serviceVolumes = service?.volumes;
		if (!serviceVolumes || !Array.isArray(serviceVolumes)) continue;

		for (const rawVolume of serviceVolumes) {
			if (typeof rawVolume === "string") {
				const parsed = parseComposeVolumeString(rawVolume);
				const source = parsed.source;
				const target = parsed.target;
				if (!source || !target) continue;

				if (hasUnresolvedVariable(source)) continue;

				if (isLikelyBindSource(source)) {
					if (source.startsWith("~/")) continue;
					const bindPath = path.isAbsolute(source)
						? source
						: path.resolve(composeBaseDir, source);
					if (isPathInside(bindPath, serviceDirPath)) continue;
					addResolvedMount(mounts, seen, {
						mountId: `compose-spec:bind:${bindPath}`,
						mountType: "bind",
						sourcePath: bindPath,
						targetPath: bindPath,
						createIfMissing: true,
						updateMountConfig: false,
						mountPath: target,
					});
					continue;
				}

				const resolvedVolume = resolveComposeVolume(
					source,
					appName,
					composeSpec,
				);
				if (!resolvedVolume) continue;
				addResolvedMount(mounts, seen, {
					mountId: `compose-spec:volume:${resolvedVolume.volumeName}`,
					mountType: "volume",
					sourcePath: resolvedVolume.volumeName,
					targetPath: resolvedVolume.volumeName,
					createIfMissing: true,
					updateMountConfig: false,
					mountPath: target,
					composeProjectName: resolvedVolume.external ? undefined : appName,
					composeVolumeKey: resolvedVolume.external
						? undefined
						: resolvedVolume.volumeKey,
				});
				continue;
			}

			if (!rawVolume || typeof rawVolume !== "object") continue;

			const mountType =
				typeof rawVolume.type === "string" ? rawVolume.type : "volume";
			const source =
				typeof rawVolume.source === "string" ? rawVolume.source : undefined;
			const target =
				typeof rawVolume.target === "string" ? rawVolume.target : undefined;

			if (!source || !target || hasUnresolvedVariable(source)) continue;

			if (mountType === "bind") {
				if (source.startsWith("~/")) continue;
				const bindPath = path.isAbsolute(source)
					? source
					: path.resolve(composeBaseDir, source);
				if (isPathInside(bindPath, serviceDirPath)) continue;
				addResolvedMount(mounts, seen, {
					mountId: `compose-spec:bind:${bindPath}`,
					mountType: "bind",
					sourcePath: bindPath,
					targetPath: bindPath,
					createIfMissing: true,
					updateMountConfig: false,
					mountPath: target,
				});
				continue;
			}

			if (mountType !== "volume") continue;
			const resolvedVolume = resolveComposeVolume(source, appName, composeSpec);
			if (!resolvedVolume) continue;
			addResolvedMount(mounts, seen, {
				mountId: `compose-spec:volume:${resolvedVolume.volumeName}`,
				mountType: "volume",
				sourcePath: resolvedVolume.volumeName,
				targetPath: resolvedVolume.volumeName,
				createIfMissing: true,
				updateMountConfig: false,
				mountPath: target,
				composeProjectName: resolvedVolume.external ? undefined : appName,
				composeVolumeKey: resolvedVolume.external
					? undefined
					: resolvedVolume.volumeKey,
			});
		}
	}

	return mounts;
}

async function getMountConfigsForTransfer(
	opts: TransferOptions,
): Promise<ResolvedMountTransferConfig[]> {
	const dbMounts = await findMountsByApplicationId(
		opts.serviceId,
		opts.serviceType,
	);
	const mountConfigs = buildMountConfigs(dbMounts);
	const seen = new Set(mountConfigs.map((mount) => getMountDedupeKey(mount)));

	if (opts.serviceType !== "compose") {
		return mountConfigs;
	}

	try {
		const compose = await findComposeById(opts.serviceId);
		const composeSpec = compose.serverId
			? await loadDockerComposeRemote(compose)
			: await loadDockerCompose(compose);
		if (!composeSpec) return mountConfigs;

		const { COMPOSE_PATH } = paths(!!compose.serverId);
		const composeRelativePath =
			compose.sourceType === "raw"
				? "docker-compose.yml"
				: compose.composePath || "docker-compose.yml";
		const composeBaseDir = path.dirname(
			path.join(COMPOSE_PATH, compose.appName, "code", composeRelativePath),
		);
		const serviceDirPath =
			getServiceDirPath("compose", compose.appName) ||
			path.join(COMPOSE_PATH, compose.appName);

		const composeSpecMounts = extractComposeSpecMounts(
			composeSpec,
			compose.appName,
			serviceDirPath,
			composeBaseDir,
			seen,
		);

		const mountsByDedupeKey = new Map(
			mountConfigs.map((mount) => [getMountDedupeKey(mount), mount]),
		);

		for (const composeSpecMount of composeSpecMounts) {
			const dedupeKey = getMountDedupeKey(composeSpecMount);
			const existingMount = mountsByDedupeKey.get(dedupeKey);
			if (!existingMount) {
				mountConfigs.push(composeSpecMount);
				mountsByDedupeKey.set(dedupeKey, composeSpecMount);
				continue;
			}

			// Preserve mount metadata from compose file when DB mounts overlap.
			if (
				!existingMount.composeProjectName &&
				composeSpecMount.composeProjectName
			) {
				existingMount.composeProjectName = composeSpecMount.composeProjectName;
			}
			if (
				!existingMount.composeVolumeKey &&
				composeSpecMount.composeVolumeKey
			) {
				existingMount.composeVolumeKey = composeSpecMount.composeVolumeKey;
			}
		}

		return mountConfigs;
	} catch (error) {
		console.warn(
			`Failed to resolve Compose-defined mounts for transfer: ${
				error instanceof Error ? error.message : "unknown error"
			}`,
		);
		return mountConfigs;
	}
}

/**
 * Calculate volume size in bytes
 */
async function getVolumeSize(
	serverId: string | null,
	volumeName: string,
): Promise<number> {
	const command = `docker run --rm -v ${shellEscape(`${volumeName}:/volume_data:ro`)} alpine sh -c 'du -sb /volume_data 2>/dev/null | cut -f1'`;
	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return Number.parseInt(stdout.trim(), 10) || 0;
	} catch {
		return 0;
	}
}

/**
 * Sync Traefik config for a service
 */
async function syncTraefikConfig(
	sourceServerId: string | null,
	targetServerId: string | null,
	appName: string,
	onProgress?: (log: string) => void,
): Promise<void> {
	onProgress?.(`Syncing Traefik config: ${appName}.yml`);

	// Read source config
	let config: string | null = null;
	if (sourceServerId) {
		config = await readRemoteConfig(sourceServerId, appName);
	} else {
		config = readConfig(appName);
	}

	if (!config) {
		onProgress?.("No Traefik config found on source, skipping");
		return;
	}

	// Write to target
	if (targetServerId) {
		await writeConfigRemote(targetServerId, appName, config);
	} else {
		writeConfig(appName, config);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Phase 1: Scan — detect files, sizes, and conflicts
 */
export async function scanServiceForTransfer(
	opts: TransferOptions,
	onProgress?: (progress: TransferScanProgress) => void,
): Promise<TransferScanResult> {
	const result: TransferScanResult = {
		volumes: [],
		binds: [],
		totalSizeBytes: 0,
		conflicts: [],
		hasConflicts: false,
	};
	const mountConfigs = await getMountConfigsForTransfer(opts);
	const dirPath = getServiceDirPath(opts.serviceType, opts.appName);
	const totalMounts = mountConfigs.length * 2 + (dirPath ? 2 : 0);
	let processedMounts = 0;
	let scannedFiles = 0;
	let processedHashes = 0;
	let totalHashes = 0;
	const scanEmitInterval = 200;
	const emitScanProgress = (
		phase: string,
		mount?: string,
		currentFile?: string,
		force = false,
	) => {
		if (!onProgress) return;
		if (!force && !currentFile && !phase.includes("complete")) {
			return;
		}
		onProgress({
			phase,
			mount,
			currentFile,
			processedMounts,
			totalMounts,
			scannedFiles,
			processedHashes,
			totalHashes,
		});
	};
	const makeFileScanner =
		(phase: string, mount: string) => (file: { path: string }) => {
			scannedFiles++;
			if (onProgress && scannedFiles % scanEmitInterval === 0) {
				emitScanProgress(phase, mount, file.path, true);
			}
		};
	emitScanProgress("Preparing scan", undefined, undefined, true);

	// 1. Scan service directory (application/compose only)
	if (dirPath) {
		emitScanProgress("Scanning source mount", dirPath, undefined, true);
		const sourceFiles = await scanBindMount(
			opts.sourceServerId,
			dirPath,
			makeFileScanner("Scanning source mount", dirPath),
		);
		processedMounts++;
		emitScanProgress("Scanned source mount", dirPath, undefined, true);
		emitScanProgress("Scanning target mount", dirPath, undefined, true);
		const targetFiles = await scanBindMount(
			opts.targetServerId,
			dirPath,
			makeFileScanner("Scanning target mount", dirPath),
		);
		processedMounts++;
		emitScanProgress("Scanned target mount", dirPath, undefined, true);
		const serviceDirMountId = getServiceDirMountId(
			opts.serviceType,
			opts.serviceId,
		);
		const compared = compareFileLists(sourceFiles, targetFiles).map((file) => ({
			...file,
			decisionKey: buildDecisionKey(serviceDirMountId, file.path),
		}));

		result.serviceDir = { path: dirPath, files: compared };
		result.totalSizeBytes += sourceFiles.reduce((s, f) => s + f.size, 0);
	}

	// 2. Check Traefik config (application/compose only)
	if (hasTraefikConfig(opts.serviceType)) {
		let sourceConfig: string | null = null;
		let targetConfig: string | null = null;

		if (opts.sourceServerId) {
			sourceConfig = await readRemoteConfig(opts.sourceServerId, opts.appName);
		} else {
			sourceConfig = readConfig(opts.appName);
		}

		if (opts.targetServerId) {
			targetConfig = await readRemoteConfig(opts.targetServerId, opts.appName);
		} else {
			targetConfig = readConfig(opts.appName);
		}

		result.traefikConfig = {
			sourceExists: !!sourceConfig,
			targetExists: !!targetConfig,
			hasConflict:
				!!sourceConfig && !!targetConfig && sourceConfig !== targetConfig,
			sourceContent: sourceConfig || undefined,
			targetContent: targetConfig || undefined,
		};
	}

	// 3. Scan all mounts (volumes + binds)
	for (const mount of mountConfigs) {
		const mountLabel = `${mount.mountType}:${mount.sourcePath}`;
		if (mount.mountType === "volume") {
			const sizeBytes = await getVolumeSize(
				opts.sourceServerId,
				mount.sourcePath,
			);
			emitScanProgress("Scanning source mount", mountLabel, undefined, true);
			const sourceFiles = await scanVolume(
				opts.sourceServerId,
				mount.sourcePath,
				makeFileScanner("Scanning source mount", mountLabel),
			);
			processedMounts++;
			emitScanProgress("Scanned source mount", mountLabel, undefined, true);
			emitScanProgress("Scanning target mount", mountLabel, undefined, true);
			const targetFiles = await scanVolume(
				opts.targetServerId,
				mount.targetPath,
				makeFileScanner("Scanning target mount", mountLabel),
			);
			processedMounts++;
			emitScanProgress("Scanned target mount", mountLabel, undefined, true);
			const compared = compareFileLists(sourceFiles, targetFiles).map(
				(file) => ({
					...file,
					decisionKey: buildDecisionKey(mount.mountId, file.path),
				}),
			);

			result.volumes.push({
				volumeName: mount.sourcePath,
				mountPath: mount.mountPath || "",
				sizeBytes,
				files: compared,
			});
			result.totalSizeBytes += sizeBytes;
		} else {
			const sourceFiles = await scanBindMount(
				opts.sourceServerId,
				mount.sourcePath,
				makeFileScanner("Scanning source mount", mountLabel),
			);
			processedMounts++;
			emitScanProgress("Scanned source mount", mountLabel, undefined, true);
			emitScanProgress("Scanning target mount", mountLabel, undefined, true);
			const targetFiles = await scanBindMount(
				opts.targetServerId,
				mount.targetPath,
				makeFileScanner("Scanning target mount", mountLabel),
			);
			processedMounts++;
			emitScanProgress("Scanned target mount", mountLabel, undefined, true);
			const compared = compareFileLists(sourceFiles, targetFiles).map(
				(file) => ({
					...file,
					decisionKey: buildDecisionKey(mount.mountId, file.path),
				}),
			);

			result.binds.push({
				hostPath: mount.sourcePath,
				files: compared,
			});
			result.totalSizeBytes += sourceFiles.reduce((s, f) => s + f.size, 0);
		}
	}

	// 4. Collect all files requiring user attention
	const allFiles: FileCompareResult[] = [];
	if (result.serviceDir) allFiles.push(...result.serviceDir.files);
	for (const v of result.volumes) allFiles.push(...v.files);
	for (const b of result.binds) allFiles.push(...b.files);

	result.conflicts = allFiles.filter(
		(f) =>
			f.status === "conflict" ||
			f.status === "newer_target" ||
			f.status === "newer_source",
	);
	totalHashes = result.conflicts.filter(
		(conflict) =>
			!conflict.isDirectory &&
			(conflict.status === "newer_source" ||
				conflict.status === "newer_target"),
	).length;
	if (totalHashes > 0) {
		emitScanProgress("Hashing changed files", undefined, undefined, true);
	}

	// Hash verification is only needed for mtime-based deltas.
	// For same-mtime "conflict" entries, size already differs so hashing is redundant.
	for (let i = 0; i < result.conflicts.length; i++) {
		const conflict = result.conflicts[i];
		if (!conflict) continue;
		if (
			conflict.status !== "newer_source" &&
			conflict.status !== "newer_target"
		) {
			continue;
		}
		if (conflict.isDirectory) continue;
		processedHashes++;
		if (processedHashes % 20 === 0 || processedHashes === totalHashes) {
			emitScanProgress("Hashing changed files", undefined, conflict.path, true);
		}

		// Determine which mount this belongs to
		let hashApplied = false;
		for (const v of result.volumes) {
			const idx = v.files.indexOf(conflict);
			if (idx >= 0) {
				const sourceHash = await computeFileHash(
					opts.sourceServerId,
					v.volumeName,
					conflict.path,
					true,
				);
				const targetHash = await computeFileHash(
					opts.targetServerId,
					v.volumeName,
					conflict.path,
					true,
				);
				conflict.hash = sourceHash || undefined;
				conflict.targetInfo = conflict.targetInfo
					? { ...conflict.targetInfo, hash: targetHash || undefined }
					: undefined;
				if (sourceHash && targetHash && sourceHash === targetHash) {
					conflict.status = "match";
				}
				hashApplied = true;
				break;
			}
		}

		if (hashApplied) continue;

		for (const b of result.binds) {
			const idx = b.files.indexOf(conflict);
			if (idx >= 0) {
				const sourceHash = await computeFileHash(
					opts.sourceServerId,
					b.hostPath,
					conflict.path,
					false,
				);
				const targetHash = await computeFileHash(
					opts.targetServerId,
					b.hostPath,
					conflict.path,
					false,
				);
				conflict.hash = sourceHash || undefined;
				conflict.targetInfo = conflict.targetInfo
					? { ...conflict.targetInfo, hash: targetHash || undefined }
					: undefined;
				if (sourceHash && targetHash && sourceHash === targetHash) {
					conflict.status = "match";
				}
				hashApplied = true;
				break;
			}
		}

		if (hashApplied || !result.serviceDir) continue;

		const idx = result.serviceDir.files.indexOf(conflict);
		if (idx >= 0) {
			const sourceHash = await computeFileHash(
				opts.sourceServerId,
				result.serviceDir.path,
				conflict.path,
				false,
			);
			const targetHash = await computeFileHash(
				opts.targetServerId,
				result.serviceDir.path,
				conflict.path,
				false,
			);
			conflict.hash = sourceHash || undefined;
			conflict.targetInfo = conflict.targetInfo
				? { ...conflict.targetInfo, hash: targetHash || undefined }
				: undefined;
			if (sourceHash && targetHash && sourceHash === targetHash) {
				conflict.status = "match";
			}
		}
	}

	// Re-evaluate after hash verification: equal-content mtime deltas become matches.
	result.conflicts = allFiles.filter(
		(f) =>
			f.status === "conflict" ||
			f.status === "newer_target" ||
			f.status === "newer_source",
	);

	result.hasConflicts = result.conflicts.length > 0;
	emitScanProgress("Scan complete", undefined, undefined, true);

	return result;
}

/**
 * Phase 2: Execute — sync files/volumes with progress, then return
 */
export async function executeTransfer(
	opts: TransferOptions,
	decisions: Record<string, "skip" | "overwrite">,
	onProgress: (progress: TransferProgress) => void,
): Promise<{ success: boolean; errors: string[] }> {
	type DiffPlannedSync = {
		mode: "diff";
		mount: ResolvedMountTransferConfig;
		compared: FileCompareResult[];
		filesToSyncCount: number;
		totalBytes: number;
		phaseLabel: string;
	};

	type ArchivePlannedSync = {
		mode: "archive";
		mount: ResolvedMountTransferConfig;
		filesToSyncCount: number;
		totalBytes: number;
		phaseLabel: string;
	};

	type PlannedSync = DiffPlannedSync | ArchivePlannedSync;

	const errors: string[] = [];
	let totalBytes = 0;
	let transferredBytes = 0;
	let totalFiles = 0;
	let processedFiles = 0;

	// Helper to emit progress
	const emit = (phase: string, currentFile?: string) => {
		onProgress({
			phase,
			currentFile,
			processedFiles,
			totalFiles,
			transferredBytes,
			totalBytes,
			percentage:
				totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0,
		});
	};

	// Ensure we have a valid target
	const targetServerId = opts.targetServerId;

	const createDiffPlan = async (
		mount: ResolvedMountTransferConfig,
		phaseLabel: string,
		decisionScope?: string,
	): Promise<DiffPlannedSync> => {
		const sourceFiles =
			mount.mountType === "volume"
				? await scanVolume(opts.sourceServerId, mount.sourcePath)
				: await scanBindMount(opts.sourceServerId, mount.sourcePath);
		const targetFiles =
			mount.mountType === "volume"
				? await scanVolume(targetServerId, mount.targetPath)
				: await scanBindMount(targetServerId, mount.targetPath);
		const compared = compareFileLists(sourceFiles, targetFiles).map((file) => ({
			...file,
			decisionKey: buildDecisionKey(decisionScope || mount.mountId, file.path),
		}));
		const filesToSync = compared.filter((file) =>
			shouldSyncFile(file, "manual", decisions, decisionScope || mount.mountId),
		);
		return {
			mode: "diff",
			mount,
			compared,
			filesToSyncCount: filesToSync.length,
			totalBytes: filesToSync.reduce((sum, file) => sum + file.size, 0),
			phaseLabel,
		};
	};

	try {
		emit("Preparing transfer plan");

		// 1. Build sync plans and totals before copying files.
		let serviceDirPlan: DiffPlannedSync | null = null;
		const dirPath = getServiceDirPath(opts.serviceType, opts.appName);
		const mountConfigs = await getMountConfigsForTransfer(opts);
		const planningTotal = (dirPath ? 1 : 0) + mountConfigs.length;
		let planningStep = 0;
		const decisionEntries = Object.entries(decisions);
		const hasSkipDecisionForScope = (scope: string) =>
			decisionEntries.some(
				([key, decision]) => key.startsWith(`${scope}:`) && decision === "skip",
			);

		const emitPlanning = (detail: string) => {
			planningStep++;
			emit(
				`Preparing transfer plan (${planningStep}/${planningTotal})`,
				detail,
			);
		};

		if (dirPath) {
			const serviceDirMount: ResolvedMountTransferConfig = {
				mountId: getServiceDirMountId(opts.serviceType, opts.serviceId),
				mountType: "bind",
				sourcePath: dirPath,
				targetPath: dirPath,
				createIfMissing: true,
				updateMountConfig: false,
			};
			const phaseLabel = `Syncing service directory: ${dirPath}`;
			emitPlanning(`Analyzing bind: ${dirPath}`);
			serviceDirPlan = await createDiffPlan(
				serviceDirMount,
				phaseLabel,
				serviceDirMount.mountId,
			);
			totalFiles += serviceDirPlan.filesToSyncCount;
			totalBytes += serviceDirPlan.totalBytes;
		}

		// 2. Build plans for mounts (volumes & binds)
		const mountPlans: PlannedSync[] = [];
		for (const mount of mountConfigs) {
			if (
				mount.mountType === "volume" &&
				!hasSkipDecisionForScope(mount.mountId)
			) {
				emitPlanning(`Analyzing volume: ${mount.sourcePath} (archive mode)`);
				const sizeBytes = await getVolumeSize(
					opts.sourceServerId,
					mount.sourcePath,
				);
				const archivePlan: ArchivePlannedSync = {
					mode: "archive",
					mount,
					filesToSyncCount: sizeBytes > 0 ? 1 : 0,
					totalBytes: sizeBytes,
					phaseLabel: `Syncing ${mount.mountType}: ${mount.sourcePath}`,
				};
				mountPlans.push(archivePlan);
				totalFiles += archivePlan.filesToSyncCount;
				totalBytes += archivePlan.totalBytes;
				continue;
			}

			emitPlanning(`Analyzing ${mount.mountType}: ${mount.sourcePath}`);
			const diffPlan = await createDiffPlan(
				mount,
				`Syncing ${mount.mountType}: ${mount.sourcePath}`,
			);
			mountPlans.push(diffPlan);
			totalFiles += diffPlan.filesToSyncCount;
			totalBytes += diffPlan.totalBytes;
		}

		// 3. Sync service directory (application/compose)
		if (serviceDirPlan && dirPath) {
			emit(serviceDirPlan.phaseLabel);
			await createDirectoryOnTarget(targetServerId, dirPath);

			const abortController = new AbortController();
			let mountProcessedFiles = 0;
			let mountTransferredBytes = 0;
			const serviceDirResult = await syncMount(
				serviceDirPlan.mount,
				serviceDirPlan.compared,
				opts.sourceServerId,
				targetServerId,
				"manual",
				decisions,
				abortController.signal,
				(status) => {
					if (status.processedFiles !== undefined) {
						const delta = status.processedFiles - mountProcessedFiles;
						mountProcessedFiles = status.processedFiles;
						if (delta > 0) {
							processedFiles += delta;
						}
					}
					if (status.transferredBytes !== undefined) {
						const delta = status.transferredBytes - mountTransferredBytes;
						mountTransferredBytes = status.transferredBytes;
						if (delta > 0) {
							transferredBytes += delta;
						}
					}
					emit(serviceDirPlan.phaseLabel, status.currentFile || undefined);
				},
			);

			if (!serviceDirResult.success) {
				errors.push(...serviceDirResult.errors);
			}
		}

		// 4. Sync Traefik config (application/compose)
		if (hasTraefikConfig(opts.serviceType)) {
			emit("Syncing Traefik configuration");
			await syncTraefikConfig(
				opts.sourceServerId,
				targetServerId,
				opts.appName,
				(log) => emit("Syncing Traefik configuration", log),
			);
		}

		// Pre-flight: create volumes/directories on target
		if (targetServerId) {
			for (const { mount } of mountPlans) {
				if (mount.mountType === "volume") {
					await createVolumeOnTarget(targetServerId, mount.targetPath, {
						labels: getComposeManagedVolumeLabels(mount),
					});
				} else {
					await createDirectoryOnTarget(targetServerId, mount.targetPath);
				}
			}
		}

		// Sync each mount
		for (const plan of mountPlans) {
			const { mount, phaseLabel } = plan;
			emit(phaseLabel);

			if (plan.mode === "archive") {
				if (plan.filesToSyncCount === 0) {
					continue;
				}
				try {
					emit(phaseLabel, "[archive stream]");
					await syncVolumeArchive(
						opts.sourceServerId,
						targetServerId,
						mount.sourcePath,
						mount.targetPath,
					);
					processedFiles += plan.filesToSyncCount;
					transferredBytes += plan.totalBytes;
					emit(phaseLabel);
				} catch (error) {
					errors.push(
						`Failed to sync volume ${mount.sourcePath}: ${
							error instanceof Error ? error.message : "Unknown error"
						}`,
					);
				}
				continue;
			}

			const abortController = new AbortController();
			let mountProcessedFiles = 0;
			let mountTransferredBytes = 0;

			const mountResult = await syncMount(
				mount,
				plan.compared,
				opts.sourceServerId,
				targetServerId,
				"manual",
				decisions,
				abortController.signal,
				(status) => {
					if (status.processedFiles !== undefined) {
						const delta = status.processedFiles - mountProcessedFiles;
						mountProcessedFiles = status.processedFiles;
						if (delta > 0) {
							processedFiles += delta;
						}
					}
					if (status.transferredBytes !== undefined) {
						const delta = status.transferredBytes - mountTransferredBytes;
						mountTransferredBytes = status.transferredBytes;
						if (delta > 0) {
							transferredBytes += delta;
						}
					}
					emit(phaseLabel, status.currentFile || undefined);
				},
			);

			if (!mountResult.success) {
				errors.push(...mountResult.errors);
			}
		}

		emit("Transfer complete");
	} catch (error) {
		const msg =
			error instanceof Error ? error.message : "Unknown transfer error";
		errors.push(msg);
		emit("Transfer failed");
	}

	return { success: errors.length === 0, errors };
}
