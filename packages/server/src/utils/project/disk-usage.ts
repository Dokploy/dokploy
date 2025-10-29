import { execAsync, execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

interface VolumeInfo {
	volumeName: string;
	serverId?: string | null;
}

type ProjectWithMounts = {
	environments?: Array<{
		applications?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		mariadb?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		mongo?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		mysql?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		postgres?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		redis?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
		compose?: Array<{
			mounts?: Array<{
				type: string;
				volumeName: string | null;
			}>;
			serverId?: string | null;
		}>;
	}>;
};

/**
 * Get the disk usage of a Docker volume in bytes
 */
const getVolumeSize = async (
	volumeName: string,
	serverId?: string | null,
): Promise<number> => {
	try {
		// Use docker system df -v to get volume sizes
		// This is more efficient than du on each volume
		const command = `docker system df -v --format "{{json .}}"`;
		let output: string;

		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			output = result.stdout;
		} else {
			const result = await execAsync(command);
			output = result.stdout;
		}

		// Parse JSON lines and find our volume
		const lines = output.trim().split("\n").filter(Boolean);
		for (const line of lines) {
			try {
				const data = JSON.parse(line) as {
					Type?: string;
					Name?: string;
					Size?: string;
				};
				if (data.Type === "Local Volume" && data.Name === volumeName) {
					// Parse size like "1.234GB" or "123.4MB" to bytes
					const sizeStr = data.Size || "";
					return parseSizeToBytes(sizeStr);
				}
			} catch {
				// Skip invalid JSON lines
			}
		}

		// Fallback: try to inspect volume mountpoint and use du
		return await getVolumeSizeFallback(volumeName, serverId);
	} catch (error) {
		console.error(`Error getting volume size for ${volumeName}:`, error);
		// Fallback method
		return await getVolumeSizeFallback(volumeName, serverId);
	}
};

/**
 * Fallback method: inspect volume and use du on the mountpoint
 */
const getVolumeSizeFallback = async (
	volumeName: string,
	serverId?: string | null,
): Promise<number> => {
	try {
		// First, get the volume mountpoint
		const inspectCommand = `docker volume inspect ${volumeName} --format '{{ .Mountpoint }}'`;
		let mountpoint: string;

		if (serverId) {
			const result = await execAsyncRemote(serverId, inspectCommand);
			mountpoint = result.stdout.trim();
		} else {
			const result = await execAsync(inspectCommand);
			mountpoint = result.stdout.trim();
		}

		if (!mountpoint) {
			return 0;
		}

		// Use du to get the size
		const duCommand = `du -sb ${mountpoint} 2>/dev/null || echo "0"`;
		let sizeStr: string;

		if (serverId) {
			const result = await execAsyncRemote(serverId, duCommand);
			sizeStr = result.stdout.trim().split(/\s+/)[0] || "0";
		} else {
			const result = await execAsync(duCommand);
			sizeStr = result.stdout.trim().split(/\s+/)[0] || "0";
		}

		return Number.parseInt(sizeStr, 10) || 0;
	} catch (error) {
		console.error(`Error in fallback volume size for ${volumeName}:`, error);
		return 0;
	}
};

/**
 * Parse size string like "1.234GB", "123.4MB" to bytes
 */
const parseSizeToBytes = (sizeStr: string): number => {
	if (!sizeStr) return 0;

	const cleanSize = sizeStr.trim().toUpperCase();
	const match = cleanSize.match(/^([\d.]+)\s*(KB|MB|GB|TB|B)?$/);

	if (!match) return 0;

	const value = parseFloat(match[1] || "0");
	const unit = match[2] || "B";

	switch (unit) {
		case "TB":
			return Math.round(value * 1024 * 1024 * 1024 * 1024);
		case "GB":
			return Math.round(value * 1024 * 1024 * 1024);
		case "MB":
			return Math.round(value * 1024 * 1024);
		case "KB":
			return Math.round(value * 1024);
		case "B":
		default:
			return Math.round(value);
	}
};

/**
 * Get all volume names from a project's services
 */
const getProjectVolumes = (project: ProjectWithMounts): VolumeInfo[] => {
	const volumes: VolumeInfo[] = [];

	for (const environment of project.environments || []) {
		// Get volumes from applications
		for (const app of environment.applications || []) {
			if (app.mounts) {
				for (const mount of app.mounts) {
					if (mount.type === "volume" && mount.volumeName) {
						volumes.push({
							volumeName: mount.volumeName,
							serverId: app.serverId,
						});
					}
				}
			}
		}

		// Get volumes from databases
		for (const service of [
			...(environment.postgres || []),
			...(environment.mariadb || []),
			...(environment.mongo || []),
			...(environment.mysql || []),
			...(environment.redis || []),
		]) {
			if (service.mounts) {
				for (const mount of service.mounts) {
					if (mount.type === "volume" && mount.volumeName) {
						volumes.push({
							volumeName: mount.volumeName,
							serverId: service.serverId,
						});
					}
				}
			}
		}

		// Get volumes from compose services
		// Note: Compose volumes might be defined in the compose file itself,
		// not in the mounts table, so we'd need to parse the compose file.
		// For now, we'll just check mounts.
		for (const compose of environment.compose || []) {
			if (compose.mounts) {
				for (const mount of compose.mounts) {
					if (mount.type === "volume" && mount.volumeName) {
						volumes.push({
							volumeName: mount.volumeName,
							serverId: compose.serverId,
						});
					}
				}
			}
		}
	}

	// Deduplicate volumes (same volume might be used by multiple services)
	const uniqueVolumes = new Map<string, VolumeInfo>();
	for (const volume of volumes) {
		if (!uniqueVolumes.has(volume.volumeName)) {
			uniqueVolumes.set(volume.volumeName, volume);
		}
	}

	return Array.from(uniqueVolumes.values());
};

/**
 * Batch get volume sizes grouped by serverId for efficiency
 */
const getVolumeSizesBatch = async (
	volumes: VolumeInfo[],
): Promise<Map<string, number>> => {
	const sizeMap = new Map<string, number>();

	// Group volumes by serverId (null/undefined means local)
	const volumesByServer = new Map<string | null, VolumeInfo[]>();
	for (const volume of volumes) {
		const key = volume.serverId ?? null;
		if (!volumesByServer.has(key)) {
			volumesByServer.set(key, []);
		}
		volumesByServer.get(key)!.push(volume);
	}

	// Process each server's volumes
	for (const [serverId, serverVolumes] of volumesByServer.entries()) {
		try {
			// Use docker system df -v to get all volume sizes at once
			const command = `docker system df -v --format "{{json .}}"`;
			let output: string;

			if (serverId) {
				const result = await execAsyncRemote(serverId, command);
				output = result.stdout;
			} else {
				const result = await execAsync(command);
				output = result.stdout;
			}

			// Parse JSON lines and extract volume sizes
			const lines = output.trim().split("\n").filter(Boolean);
			const volumeSizeMap = new Map<string, number>();

			for (const line of lines) {
				try {
					const data = JSON.parse(line) as {
						Type?: string;
						Name?: string;
						Size?: string;
					};
					if (data.Type === "Local Volume" && data.Name && data.Size) {
						volumeSizeMap.set(
							data.Name,
							parseSizeToBytes(data.Size),
						);
					}
				} catch {
					// Skip invalid JSON lines
				}
			}

			// Map volumes to their sizes, with fallback for volumes not in df output
			for (const volume of serverVolumes) {
				const size = volumeSizeMap.get(volume.volumeName);
				if (size !== undefined) {
					sizeMap.set(volume.volumeName, size);
				} else {
					// Fallback: try individual inspection
					try {
						const fallbackSize = await getVolumeSizeFallback(
							volume.volumeName,
							serverId,
						);
						if (fallbackSize > 0) {
							sizeMap.set(volume.volumeName, fallbackSize);
						}
					} catch {
						// Volume might not exist or be inaccessible
						sizeMap.set(volume.volumeName, 0);
					}
				}
			}
		} catch (error) {
			console.error(
				`Error getting volume sizes for server ${serverId ?? "local"}:`,
				error,
			);
			// Fallback to individual calls
			for (const volume of serverVolumes) {
				try {
					const size = await getVolumeSize(volume.volumeName, serverId);
					sizeMap.set(volume.volumeName, size);
				} catch {
					sizeMap.set(volume.volumeName, 0);
				}
			}
		}
	}

	return sizeMap;
};

/**
 * Calculate total disk usage for a project in bytes
 */
export const calculateProjectDiskUsage = async (
	project: ProjectWithMounts,
): Promise<number> => {
	const volumes = getProjectVolumes(project);

	if (volumes.length === 0) {
		return 0;
	}

	try {
		// Get sizes for all volumes in batches
		const sizeMap = await getVolumeSizesBatch(volumes);

		// Sum all sizes
		let total = 0;
		for (const volume of volumes) {
			total += sizeMap.get(volume.volumeName) ?? 0;
		}

		return total;
	} catch (error) {
		console.error("Error calculating project disk usage:", error);
		return 0;
	}
};

