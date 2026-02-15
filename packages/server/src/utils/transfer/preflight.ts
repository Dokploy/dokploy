/**
 * Pre-flight checks for transfer target server
 */
import { findServerById } from "@dokploy/server/services/server";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { shellEscape } from "../process/ssh";
import type { MountTransferConfig, PreflightCheckResult } from "./types";

export interface VolumeCreateOptions {
	labels?: Record<string, string>;
}

function buildVolumeLabelArgs(labels?: Record<string, string>): string {
	if (!labels) return "";

	return Object.entries(labels)
		.filter(([, value]) => value.length > 0)
		.map(([key, value]) => `--label ${shellEscape(`${key}=${value}`)}`)
		.join(" ");
}

/**
 * Check if a path exists and is writable on the target server
 */
export async function checkPathPermissions(
	serverId: string | null,
	path: string,
): Promise<PreflightCheckResult> {
	const escapedPath = shellEscape(path);
	const command = `
		TARGET_PATH=${escapedPath}
		if [ -e "$TARGET_PATH" ]; then
			EXISTS="true"
			if [ -w "$TARGET_PATH" ]; then
				WRITABLE="true"
			else
				WRITABLE="false"
			fi
		else
			EXISTS="false"
			# Check if parent is writable (can create)
			PARENT=$(dirname "$TARGET_PATH")
			if [ -w "$PARENT" ]; then
				WRITABLE="true"
			else
				WRITABLE="false"
			fi
		fi
		SPACE=$(df -B1 "$TARGET_PATH" 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
		echo "$EXISTS|$WRITABLE|$SPACE"
	`;

	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);

		const parts = stdout.trim().split("|");
		const exists = parts[0] || "false";
		const writable = parts[1] || "false";
		const space = parts[2] || "0";
		return {
			path,
			exists: exists === "true",
			writable: writable === "true",
			spaceAvailable: Number.parseInt(space, 10) || 0,
		};
	} catch (error) {
		return {
			path,
			exists: false,
			writable: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Check if Docker volume exists on target server
 */
export async function checkVolumeExists(
	serverId: string | null,
	volumeName: string,
): Promise<boolean> {
	const command = `docker volume inspect ${shellEscape(volumeName)} > /dev/null 2>&1 && echo "exists" || echo "missing"`;

	try {
		const { stdout } = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		return stdout.trim() === "exists";
	} catch {
		return false;
	}
}

/**
 * Create directory on target server
 */
export async function createDirectoryOnTarget(
	serverId: string | null,
	path: string,
): Promise<{ success: boolean; error?: string }> {
	const command = `mkdir -p ${shellEscape(path)}`;

	try {
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to create directory",
		};
	}
}

/**
 * Create Docker volume on target server
 */
export async function createVolumeOnTarget(
	serverId: string | null,
	volumeName: string,
	options?: VolumeCreateOptions,
): Promise<{ success: boolean; error?: string }> {
	const labelArgs = buildVolumeLabelArgs(options?.labels);
	const command = ["docker volume create", labelArgs, shellEscape(volumeName)]
		.filter(Boolean)
		.join(" ");

	try {
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to create volume",
		};
	}
}

/**
 * Run pre-flight checks for all mounts
 */
export async function runPreflightChecks(
	targetServerId: string,
	mounts: MountTransferConfig[],
	emit?: (data: { mount: string; result: PreflightCheckResult }) => void,
): Promise<Map<string, PreflightCheckResult>> {
	const results = new Map<string, PreflightCheckResult>();

	for (const mount of mounts) {
		let result: PreflightCheckResult;

		if (mount.mountType === "volume") {
			const exists = await checkVolumeExists(targetServerId, mount.targetPath);
			result = {
				path: mount.targetPath,
				exists,
				writable: true, // Volumes are always writable if they exist
			};
		} else {
			result = await checkPathPermissions(targetServerId, mount.targetPath);
		}

		results.set(mount.mountId, result);

		if (emit) {
			emit({ mount: mount.mountId, result });
		}
	}

	return results;
}

/**
 * Get SSH connection info for establishing direct transfer
 */
export async function getServerSSHInfo(serverId: string) {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) {
		throw new Error("Target server has no SSH key configured");
	}
	return {
		host: server.ipAddress,
		port: server.port,
		username: server.username,
		privateKey: server.sshKey?.privateKey,
	};
}
