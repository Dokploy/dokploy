import { execAsync, execAsyncRemote } from "../process/execAsync";
import type {
	ConflictStatus,
	FileConflict,
	FileInfo,
	MountTransferConfig,
} from "./types";

export const scanDirectory = async (
	serverId: string | null,
	dirPath: string,
): Promise<FileInfo[]> => {
	const command = `find ${dirPath} -type f -exec stat --format='%n|%s|%Y' {} + 2>/dev/null || true`;

	let stdout: string;
	if (serverId) {
		const result = await execAsyncRemote(serverId, command);
		stdout = result.stdout;
	} else {
		const result = await execAsync(command);
		stdout = result.stdout;
	}

	if (!stdout.trim()) return [];

	return stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [filePath, size, modifiedAt] = line.split("|");
			return {
				path: filePath!.replace(dirPath, "").replace(/^\//, ""),
				size: Number.parseInt(size || "0", 10),
				modifiedAt: Number.parseInt(modifiedAt || "0", 10),
			};
		});
};

export const scanDockerVolume = async (
	serverId: string | null,
	volumeName: string,
): Promise<FileInfo[]> => {
	const command = `docker run --rm -v ${volumeName}:/volume alpine find /volume -type f -exec stat -c '%n|%s|%Y' {} + 2>/dev/null || true`;

	let stdout: string;
	if (serverId) {
		const result = await execAsyncRemote(serverId, command);
		stdout = result.stdout;
	} else {
		const result = await execAsync(command);
		stdout = result.stdout;
	}

	if (!stdout.trim()) return [];

	return stdout
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [filePath, size, modifiedAt] = line.split("|");
			return {
				path: (filePath || "").replace("/volume/", ""),
				size: Number.parseInt(size || "0", 10),
				modifiedAt: Number.parseInt(modifiedAt || "0", 10),
			};
		});
};

export const computeFileHash = async (
	serverId: string | null,
	filePath: string,
): Promise<string> => {
	const command = `md5sum "${filePath}" | awk '{print $1}'`;

	let stdout: string;
	if (serverId) {
		const result = await execAsyncRemote(serverId, command);
		stdout = result.stdout;
	} else {
		const result = await execAsync(command);
		stdout = result.stdout;
	}

	return stdout.trim();
};

export const computeVolumeFileHash = async (
	serverId: string | null,
	volumeName: string,
	filePath: string,
): Promise<string> => {
	const command = `docker run --rm -v ${volumeName}:/volume alpine md5sum "/volume/${filePath}" | awk '{print $1}'`;

	let stdout: string;
	if (serverId) {
		const result = await execAsyncRemote(serverId, command);
		stdout = result.stdout;
	} else {
		const result = await execAsync(command);
		stdout = result.stdout;
	}

	return stdout.trim();
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
	if (mount.type === "file") {
		return [];
	}
	return [];
};

export const compareFileLists = async (
	sourceFiles: FileInfo[],
	targetFiles: FileInfo[],
	sourceServerId: string | null,
	targetServerId: string,
	basePath?: string,
	volumeName?: string,
): Promise<FileConflict[]> => {
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

		let sourceHash: string;
		let targetHash: string;

		if (volumeName) {
			sourceHash = await computeVolumeFileHash(
				sourceServerId,
				volumeName,
				sourceFile.path,
			);
			targetHash = await computeVolumeFileHash(
				targetServerId,
				volumeName,
				targetFile.path,
			);
		} else if (basePath) {
			sourceHash = await computeFileHash(
				sourceServerId,
				`${basePath}/${sourceFile.path}`,
			);
			targetHash = await computeFileHash(
				targetServerId,
				`${basePath}/${targetFile.path}`,
			);
		} else {
			sourceHash = "";
			targetHash = "";
		}

		if (sourceHash && targetHash && sourceHash === targetHash) {
			conflicts.push({
				path: sourceFile.path,
				status: "match",
				sourceFile: { ...sourceFile, hash: sourceHash },
				targetFile: { ...targetFile, hash: targetHash },
			});
			continue;
		}

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
			sourceFile: { ...sourceFile, hash: sourceHash || undefined },
			targetFile: { ...targetFile, hash: targetHash || undefined },
		});
	}

	for (const targetFile of targetFiles) {
		const exists = sourceFiles.some((sf) => sf.path === targetFile.path);
		if (!exists) {
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
