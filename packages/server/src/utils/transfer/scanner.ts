import { execAsync, execAsyncRemote } from "../process/execAsync";
import type {
	ConflictStatus,
	FileConflict,
	FileInfo,
	MountTransferConfig,
} from "./types";

const execOnServer = async (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}
	return execAsync(command);
};

export const scanDirectory = async (
	serverId: string | null,
	dirPath: string,
): Promise<FileInfo[]> => {
	// Check if directory exists first
	try {
		const { stdout: exists } = await execOnServer(
			serverId,
			`test -d "${dirPath}" && echo "yes" || echo "no"`,
		);
		if (exists.trim() !== "yes") {
			return [];
		}
	} catch {
		return [];
	}

	// Use find + stat -c (POSIX-compatible on Linux)
	// stat -c works on GNU coreutils (Debian, Ubuntu, etc.)
	const command = `find "${dirPath}" -type f -printf '%p|%s|%T@\\n' 2>/dev/null`;

	try {
		const { stdout } = await execOnServer(serverId, command);
		if (!stdout.trim()) return [];

		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const parts = line.split("|");
				const filePath = parts[0] || "";
				const size = parts[1] || "0";
				const modifiedAt = parts[2] || "0";
				return {
					path: filePath.replace(dirPath, "").replace(/^\//, ""),
					size: Number.parseInt(size, 10),
					modifiedAt: Math.floor(Number.parseFloat(modifiedAt)),
				};
			})
			.filter((f) => f.path);
	} catch {
		// Fallback: try simpler ls-based approach
		try {
			const { stdout } = await execOnServer(
				serverId,
				`find "${dirPath}" -type f 2>/dev/null`,
			);
			if (!stdout.trim()) return [];

			return stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((filePath) => ({
					path: filePath.replace(dirPath, "").replace(/^\//, ""),
					size: 0,
					modifiedAt: 0,
				}))
				.filter((f) => f.path);
		} catch {
			return [];
		}
	}
};

export const scanDockerVolume = async (
	serverId: string | null,
	volumeName: string,
): Promise<FileInfo[]> => {
	// First check if volume exists
	try {
		const { stdout: exists } = await execOnServer(
			serverId,
			`docker volume inspect "${volumeName}" >/dev/null 2>&1 && echo "yes" || echo "no"`,
		);
		if (exists.trim() !== "yes") {
			return [];
		}
	} catch {
		return [];
	}

	// Use busybox/alpine stat format (-c '%n|%s|%Y')
	const command = `docker run --rm -v "${volumeName}":/volume:ro alpine sh -c 'find /volume -type f -exec stat -c "%n|%s|%Y" {} + 2>/dev/null || find /volume -type f 2>/dev/null'`;

	try {
		const { stdout } = await execOnServer(serverId, command);
		if (!stdout.trim()) return [];

		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				const parts = line.split("|");
				if (parts.length >= 3) {
					return {
						path: (parts[0] || "").replace(/^\/volume\/?/, ""),
						size: Number.parseInt(parts[1] || "0", 10),
						modifiedAt: Number.parseInt(parts[2] || "0", 10),
					};
				}
				// Fallback: just file path
				return {
					path: line.replace(/^\/volume\/?/, ""),
					size: 0,
					modifiedAt: 0,
				};
			})
			.filter((f) => f.path);
	} catch {
		return [];
	}
};

export const getDirectorySize = async (
	serverId: string | null,
	dirPath: string,
): Promise<number> => {
	try {
		const { stdout } = await execOnServer(
			serverId,
			`du -sb "${dirPath}" 2>/dev/null | awk '{print $1}'`,
		);
		return Number.parseInt(stdout.trim(), 10) || 0;
	} catch {
		return 0;
	}
};

export const getVolumeSize = async (
	serverId: string | null,
	volumeName: string,
): Promise<number> => {
	try {
		const { stdout } = await execOnServer(
			serverId,
			`docker run --rm -v "${volumeName}":/volume:ro alpine du -sb /volume 2>/dev/null | awk '{print $1}'`,
		);
		return Number.parseInt(stdout.trim(), 10) || 0;
	} catch {
		return 0;
	}
};

/**
 * List all Docker volumes belonging to a compose project.
 * Docker compose automatically labels volumes with com.docker.compose.project
 */
export const listComposeVolumes = async (
	serverId: string | null,
	projectName: string,
): Promise<string[]> => {
	try {
		const { stdout } = await execOnServer(
			serverId,
			`docker volume ls --filter "label=com.docker.compose.project=${projectName}" --format "{{.Name}}" 2>/dev/null`,
		);
		if (!stdout.trim()) return [];
		return stdout.trim().split("\n").filter(Boolean);
	} catch {
		return [];
	}
};

/**
 * List all Docker volumes that match a prefix pattern (appName_*).
 * Fallback for when compose labels are not available.
 */
export const listVolumesByPrefix = async (
	serverId: string | null,
	prefix: string,
): Promise<string[]> => {
	try {
		const { stdout } = await execOnServer(
			serverId,
			`docker volume ls --format "{{.Name}}" 2>/dev/null | grep "^${prefix}" || true`,
		);
		if (!stdout.trim()) return [];
		return stdout.trim().split("\n").filter(Boolean);
	} catch {
		return [];
	}
};

export const computeFileHash = async (
	serverId: string | null,
	filePath: string,
): Promise<string> => {
	try {
		const { stdout } = await execOnServer(
			serverId,
			`md5sum "${filePath}" 2>/dev/null | awk '{print $1}'`,
		);
		return stdout.trim();
	} catch {
		return "";
	}
};

export const scanMount = async (
	serverId: string | null,
	mount: MountTransferConfig,
): Promise<FileInfo[]> => {
	if (mount.type === "volume" && mount.volumeName) {
		return scanDockerVolume(serverId, mount.volumeName);
	}
	if (mount.type === "bind" && mount.hostPath) {
		return scanDirectory(serverId, mount.hostPath);
	}
	return [];
};

export const compareFileLists = (
	sourceFiles: FileInfo[],
	targetFiles: FileInfo[],
): FileConflict[] => {
	const targetMap = new Map<string, FileInfo>();
	for (const f of targetFiles) {
		targetMap.set(f.path, f);
	}

	const conflicts: FileConflict[] = [];

	for (const sourceFile of sourceFiles) {
		const targetFile = targetMap.get(sourceFile.path);

		if (!targetFile) {
			conflicts.push({
				path: sourceFile.path,
				status: "missing_target",
				sourceFile,
			});
			continue;
		}

		if (
			sourceFile.size === targetFile.size &&
			sourceFile.modifiedAt === targetFile.modifiedAt
		) {
			conflicts.push({
				path: sourceFile.path,
				status: "match",
				sourceFile,
				targetFile,
			});
			continue;
		}

		// Different size or time = conflict
		let status: ConflictStatus;
		if (sourceFile.modifiedAt > targetFile.modifiedAt) {
			status = "newer_source";
		} else if (targetFile.modifiedAt > sourceFile.modifiedAt) {
			status = "newer_target";
		} else {
			status = "conflict";
		}

		conflicts.push({
			path: sourceFile.path,
			status,
			sourceFile,
			targetFile,
		});
	}

	// Files only on target
	for (const targetFile of targetFiles) {
		if (!sourceFiles.some((sf) => sf.path === targetFile.path)) {
			conflicts.push({
				path: targetFile.path,
				status: "newer_target",
				sourceFile: { path: targetFile.path, size: 0, modifiedAt: 0 },
				targetFile,
			});
		}
	}

	return conflicts;
};
