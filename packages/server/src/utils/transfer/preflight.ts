import { execAsync, execAsyncRemote } from "../process/execAsync";
import type { MountTransferConfig } from "./types";

const execOnServer = async (
	serverId: string | null,
	command: string,
): Promise<{ stdout: string; stderr: string }> => {
	if (serverId) {
		return execAsyncRemote(serverId, command);
	}
	return execAsync(command);
};

export const ensureDirectoryExists = async (
	serverId: string | null,
	dirPath: string,
): Promise<void> => {
	await execOnServer(serverId, `mkdir -p "${dirPath}"`);
};

export const ensureVolumeExists = async (
	serverId: string | null,
	volumeName: string,
): Promise<void> => {
	await execOnServer(
		serverId,
		`docker volume inspect ${volumeName} > /dev/null 2>&1 || docker volume create ${volumeName}`,
	);
};

export const checkDiskSpace = async (
	serverId: string | null,
	path: string,
): Promise<number> => {
	const { stdout } = await execOnServer(
		serverId,
		`df -B1 "${path}" | tail -1 | awk '{print $4}'`,
	);
	return Number.parseInt(stdout.trim(), 10);
};

export const runPreflightChecks = async (
	targetServerId: string,
	targetBasePath: string,
	requiredBytes: number,
	mounts: MountTransferConfig[],
	onLog?: (message: string) => void,
): Promise<{ passed: boolean; errors: string[] }> => {
	const errors: string[] = [];

	onLog?.("Checking disk space on target server...");
	try {
		const availableBytes = await checkDiskSpace(targetServerId, "/");
		if (availableBytes < requiredBytes * 1.2) {
			errors.push(
				`Insufficient disk space on target server. Required: ${formatBytes(requiredBytes)}, Available: ${formatBytes(availableBytes)}`,
			);
		}
	} catch {
		errors.push("Failed to check disk space on target server");
	}

	onLog?.("Ensuring target directories exist...");
	try {
		await ensureDirectoryExists(targetServerId, targetBasePath);
	} catch {
		errors.push(`Failed to create directory: ${targetBasePath}`);
	}

	for (const mount of mounts) {
		if (mount.type === "volume" && mount.volumeName) {
			onLog?.(`Ensuring volume exists: ${mount.volumeName}`);
			try {
				await ensureVolumeExists(targetServerId, mount.volumeName);
			} catch {
				errors.push(`Failed to create volume: ${mount.volumeName}`);
			}
		} else if (mount.type === "bind" && mount.hostPath) {
			onLog?.(`Ensuring bind mount path exists: ${mount.hostPath}`);
			try {
				await ensureDirectoryExists(targetServerId, mount.hostPath);
			} catch {
				errors.push(`Failed to create directory: ${mount.hostPath}`);
			}
		}
	}

	return {
		passed: errors.length === 0,
		errors,
	};
};

const formatBytes = (bytes: number): string => {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};
