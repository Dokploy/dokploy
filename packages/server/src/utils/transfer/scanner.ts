/**
 * File scanning and comparison utilities for transfer
 */
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { shellEscape } from "../process/ssh";
import type {
	FileCompareResult,
	FileCompareStatus,
	FileInfo,
	MountTransferConfig,
} from "./types";

/**
 * Scan files in a Docker volume
 */
export async function scanVolume(
	serverId: string | null,
	volumeName: string,
	emit?: (file: FileInfo) => void,
): Promise<FileInfo[]> {
	// Use a temporary container to list files in the volume
	const volumeMount = shellEscape(`${volumeName}:/volume_data:ro`);
	const command = `
		docker run --rm -v ${volumeMount} alpine sh -c '
			find /volume_data -type f -o -type d | while read f; do
				if [ -f "$f" ]; then
					STAT=$(stat -c "%s|%Y|%a" "$f" 2>/dev/null || echo "0|0|644")
					echo "f|$f|$STAT"
				elif [ -d "$f" ]; then
					STAT=$(stat -c "0|%Y|%a" "$f" 2>/dev/null || echo "0|0|755")
					echo "d|$f|$STAT"
				fi
			done
		'
	`;

	const files: FileInfo[] = [];

	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		for (const line of stdout.trim().split("\n")) {
			if (!line) continue;
			const parts = line.split("|");
			const type = parts[0] || "f";
			const fullPath = parts[1] || "";
			const size = parts[2] || "0";
			const mtime = parts[3] || "0";
			const mode = parts[4] || (type === "d" ? "755" : "644");
			const path = fullPath.replace("/volume_data", "");
			if (!path) continue;

			const fileInfo: FileInfo = {
				path,
				size: Number.parseInt(size, 10) || 0,
				mtime: Number.parseInt(mtime, 10) || 0,
				mode,
				isDirectory: type === "d",
			};

			files.push(fileInfo);
			if (emit) emit(fileInfo);
		}
	} catch (error) {
		console.error(`Error scanning volume ${volumeName}:`, error);
	}

	return files;
}

/**
 * Scan files in a bind mount path
 */
export async function scanBindMount(
	serverId: string | null,
	hostPath: string,
	emit?: (file: FileInfo) => void,
): Promise<FileInfo[]> {
	const escapedHostPath = shellEscape(hostPath);
	const command = `
		find ${escapedHostPath} -type f -o -type d 2>/dev/null | while read f; do
			if [ -f "$f" ]; then
				STAT=$(stat -c "%s|%Y|%a" "$f" 2>/dev/null || echo "0|0|644")
				echo "f|$f|$STAT"
			elif [ -d "$f" ]; then
				STAT=$(stat -c "0|%Y|%a" "$f" 2>/dev/null || echo "0|0|755")
				echo "d|$f|$STAT"
			fi
		done
	`;

	const files: FileInfo[] = [];

	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		for (const line of stdout.trim().split("\n")) {
			if (!line) continue;
			const parts = line.split("|");
			const type = parts[0] || "f";
			const fullPath = parts[1] || "";
			const size = parts[2] || "0";
			const mtime = parts[3] || "0";
			const mode = parts[4] || (type === "d" ? "755" : "644");
			const path = fullPath.replace(hostPath, "");
			if (!path) continue;

			const fileInfo: FileInfo = {
				path,
				size: Number.parseInt(size, 10) || 0,
				mtime: Number.parseInt(mtime, 10) || 0,
				mode,
				isDirectory: type === "d",
			};

			files.push(fileInfo);
			if (emit) emit(fileInfo);
		}
	} catch (error) {
		console.error(`Error scanning bind mount ${hostPath}:`, error);
	}

	return files;
}

/**
 * Scan files based on mount type
 */
export async function scanMount(
	serverId: string | null,
	mount: MountTransferConfig,
	emit?: (file: FileInfo) => void,
): Promise<FileInfo[]> {
	if (mount.mountType === "volume") {
		return scanVolume(serverId, mount.sourcePath, emit);
	}
	return scanBindMount(serverId, mount.sourcePath, emit);
}

/**
 * Compare two file lists and determine sync actions
 */
export function compareFileLists(
	sourceFiles: FileInfo[],
	targetFiles: FileInfo[],
): FileCompareResult[] {
	const targetMap = new Map<string, FileInfo>();
	for (const file of targetFiles) {
		targetMap.set(file.path, file);
	}

	const results: FileCompareResult[] = [];
	const seenPaths = new Set<string>();

	// Check source files against target
	for (const source of sourceFiles) {
		seenPaths.add(source.path);
		const target = targetMap.get(source.path);

		let status: FileCompareStatus;
		if (!target) {
			status = "missing_target";
		} else if (source.size === target.size && source.mtime === target.mtime) {
			status = "match";
		} else if (source.mtime > target.mtime) {
			status = "newer_source";
		} else if (source.mtime < target.mtime) {
			status = "newer_target";
		} else {
			// Same mtime but different size = conflict
			status = "conflict";
		}

		results.push({
			...source,
			status,
			targetInfo: target,
		});
	}

	// Check for files only on target
	for (const target of targetFiles) {
		if (!seenPaths.has(target.path)) {
			results.push({
				...target,
				status: "missing_source",
				targetInfo: target,
			});
		}
	}

	return results;
}

/**
 * Compute MD5 hash for a file (for conflict resolution)
 */
export async function computeFileHash(
	serverId: string | null,
	basePath: string,
	relativePath: string,
	isVolume: boolean,
): Promise<string | null> {
	let command: string;

	if (isVolume) {
		command = `docker run --rm -v ${shellEscape(`${basePath}:/volume_data:ro`)} alpine md5sum ${shellEscape(`/volume_data${relativePath}`)} 2>/dev/null | cut -d' ' -f1`;
	} else {
		command = `md5sum ${shellEscape(`${basePath}${relativePath}`)} 2>/dev/null | cut -d' ' -f1`;
	}

	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Compare files with optional hash verification
 */
export async function compareFilesWithHash(
	sourceServerId: string | null,
	targetServerId: string,
	mount: MountTransferConfig,
	file: FileCompareResult,
): Promise<FileCompareResult> {
	if (file.status !== "conflict") {
		return file;
	}

	const isVolume = mount.mountType === "volume";
	const sourceHash = await computeFileHash(
		sourceServerId,
		mount.sourcePath,
		file.path,
		isVolume,
	);
	const targetHash = await computeFileHash(
		targetServerId,
		mount.targetPath,
		file.path,
		isVolume,
	);

	if (sourceHash && targetHash && sourceHash === targetHash) {
		return { ...file, status: "match", hash: sourceHash };
	}

	return { ...file, hash: sourceHash || undefined };
}
