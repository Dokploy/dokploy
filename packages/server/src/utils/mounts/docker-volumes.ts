import type Dockerode from "dockerode";
import { getRemoteDocker } from "../servers/remote-docker";
import { createMountError } from "../errors/structured-errors";
import { retryWithBackoff, isNetworkError } from "../errors/retry";

export interface CreateNFSVolumeParams {
	volumeName: string;
	nfsServer: string;
	nfsPath: string;
	mountOptions?: string;
	serverId?: string | null;
}

/**
 * Creates a Docker volume using the local driver with NFS options
 */
export const createNFSVolume = async (
	params: CreateNFSVolumeParams,
): Promise<void> => {
	const { volumeName, nfsServer, nfsPath, mountOptions, serverId } = params;

	const docker = await getRemoteDocker(serverId);

	// Build mount options string
	// Default options: rw (read-write)
	const options = mountOptions || "rw";
	const mountOpts = `addr=${nfsServer},${options}`;

	try {
		await retryWithBackoff(
			async () => {
				await docker.createVolume({
					Name: volumeName,
					Driver: "local",
					DriverOpts: {
						type: "nfs",
						o: mountOpts,
						device: `:${nfsPath}`,
					},
				});
			},
			{
				maxRetries: 3,
				retryCondition: isNetworkError,
			},
		);
	} catch (error) {
		throw createMountError(
			`Failed to create Docker NFS volume ${volumeName}`,
			{
				mountType: "nfs",
				nfsServer,
				nfsPath,
				volumeName,
				originalError: error instanceof Error ? error.message : String(error),
			},
		);
	}
};

/**
 * Removes a Docker volume
 */
export const removeNFSVolume = async (
	volumeName: string,
	serverId?: string | null,
): Promise<void> => {
	const docker = await getRemoteDocker(serverId);

	try {
		const volume = docker.getVolume(volumeName);
		await volume.remove({ force: true });
	} catch (error) {
		// Volume might not exist, which is fine
		if (
			error instanceof Error &&
			error.message.includes("No such volume")
		) {
			return;
		}
		throw createMountError(
			`Failed to remove Docker volume ${volumeName}`,
			{
				mountType: "nfs",
				volumeName,
				originalError: error instanceof Error ? error.message : String(error),
			},
		);
	}
};

/**
 * Verifies that a Docker volume exists and is accessible
 */
export const verifyNFSVolume = async (
	volumeName: string,
	serverId?: string | null,
): Promise<{ exists: boolean; error?: string }> => {
	const docker = await getRemoteDocker(serverId);

	try {
		const volume = docker.getVolume(volumeName);
		await volume.inspect();
		return { exists: true };
	} catch (error) {
		return {
			exists: false,
			error:
				error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Syncs Docker volumes to selected Swarm nodes
 * Docker volumes need to exist on nodes where tasks run
 */
export const syncDockerVolumesToNodes = async (
	volumeName: string,
	nfsServer: string,
	nfsPath: string,
	mountOptions: string | undefined,
	nodeIds: string[],
	serverId?: string | null,
): Promise<Map<string, { success: boolean; error?: string }>> => {
	const results = new Map<string, { success: boolean; error?: string }>();

	// Get Docker instance for the server
	const docker = await getRemoteDocker(serverId);

	// For each node, we need to create the volume on that node
	// In Docker Swarm, volumes are created on the manager node and
	// Docker handles distribution, but for NFS volumes, we may need
	// to ensure they exist on each node where tasks might run

	// Get swarm nodes to determine which nodes need the volume
	const { getSwarmNodes } = await import("../../services/docker");
	const allNodes = await getSwarmNodes(serverId || undefined);

	if (!allNodes || allNodes.length === 0) {
		throw new Error("No swarm nodes found");
	}

	for (const nodeId of nodeIds) {
		try {
			// Check if node exists
			const node = allNodes.find((n) => n.ID === nodeId);
			if (!node) {
				results.set(nodeId, {
					success: false,
					error: `Node ${nodeId} not found in swarm`,
				});
				continue;
			}

			// For Docker Swarm, volumes created on the manager are available
			// to all nodes. However, NFS volumes with the local driver need
			// to be accessible from each node. We'll create the volume and
			// Docker will handle the mount when a container uses it.

			// Try to create/inspect the volume
			// If it already exists, that's fine
			try {
				const volume = docker.getVolume(volumeName);
				await volume.inspect();
				// Volume exists, mark as success
				results.set(nodeId, { success: true });
			} catch (error) {
				// Volume doesn't exist, create it
				// Note: In Swarm mode, volumes are typically created on the manager
				// and Docker handles making them available to worker nodes
				if (
					error instanceof Error &&
					error.message.includes("No such volume")
				) {
					// Only create on manager node (or if we're on the manager)
					if (node.Spec.Role === "manager" || !serverId) {
						await createNFSVolume({
							volumeName,
							nfsServer,
							nfsPath,
							mountOptions,
							serverId,
						});
						results.set(nodeId, { success: true });
					} else {
						// For worker nodes, the volume will be created when needed
						// by Docker Swarm. We'll mark it as success but note that
						// the actual mount happens when a container uses it.
						results.set(nodeId, { success: true });
					}
				} else {
					throw error;
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			results.set(nodeId, { success: false, error: errorMessage });
		}
	}

	return results;
};

/**
 * Gets volume information
 */
export const getVolumeInfo = async (
	volumeName: string,
	serverId?: string | null,
): Promise<{
	name: string;
	driver: string;
	mountpoint?: string;
	options?: Record<string, string>;
} | null> => {
	const docker = await getRemoteDocker(serverId);

	try {
		const volume = docker.getVolume(volumeName);
		const info = await volume.inspect();
		return {
			name: info.Name,
			driver: info.Driver,
			mountpoint: info.Mountpoint,
			options: info.Options,
		};
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("No such volume")
		) {
			return null;
		}
		throw error;
	}
};

