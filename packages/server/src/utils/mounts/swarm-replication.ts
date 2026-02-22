import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { mounts } from "../../db/schema/mount";
import { mountCredentials } from "../../db/schema/mount-credentials";
import { mountNodeStatus } from "../../db/schema/mount-node-status";
import { getNodeInfo, getSwarmNodes } from "../../services/docker";
import { decryptMountCredentials } from "../encryption/mount-credentials";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { syncDockerVolumesToNodes } from "./docker-volumes";
import { mountNFS, mountSMB, verifyMount } from "./host-mount";

export interface SwarmNodeInfo {
	nodeId: string;
	hostname: string;
	ip: string;
	role: "manager" | "worker";
	status: string;
	availability: "active" | "pause" | "drain";
	labels?: Record<string, string>;
}

/**
 * Gets list of swarm nodes that need the mount based on targetNodes configuration
 * Validates that all target nodes are accessible and in the swarm
 */
export const getSwarmNodesForMount = async (
	mount: typeof mounts.$inferSelect,
	serverId?: string | null,
): Promise<SwarmNodeInfo[]> => {
	if (!mount.replicateToSwarm) {
		return [];
	}

	if (!mount.targetNodes || mount.targetNodes.length === 0) {
		throw new Error(
			"targetNodes must be specified when replicateToSwarm is true",
		);
	}

	// Get all swarm nodes
	const allNodes = await getSwarmNodes(serverId || undefined);
	if (!allNodes || allNodes.length === 0) {
		throw new Error("No swarm nodes found");
	}

	// Filter to only target nodes and get detailed info
	const targetNodeInfos: SwarmNodeInfo[] = [];

	for (const targetNodeId of mount.targetNodes) {
		const node = allNodes.find((n) => n.ID === targetNodeId);
		if (!node) {
			throw new Error(
				`Node ${targetNodeId} not found in swarm. It may have been removed.`,
			);
		}

		// Filter out drained/removed nodes
		if (node.Spec.Availability === "drain") {
			console.warn(
				`Node ${targetNodeId} is drained, skipping mount configuration`,
			);
			continue;
		}

		// Get detailed node info
		const nodeInfo = await getNodeInfo(targetNodeId, serverId || undefined);
		if (!nodeInfo) {
			throw new Error(`Failed to get info for node ${targetNodeId}`);
		}

		targetNodeInfos.push({
			nodeId: targetNodeId,
			hostname: node.Description?.Hostname || targetNodeId,
			ip: node.Status?.Addr || "",
			role: node.Spec.Role,
			status: node.Status?.State || "unknown",
			availability: node.Spec.Availability,
			labels: node.Spec.Labels || {},
		});
	}

	return targetNodeInfos;
};

/**
 * Securely distributes encrypted credentials to specified nodes via SSH
 */
export const distributeCredentialsToNodes = async (
	mount: typeof mounts.$inferSelect,
	nodeIds: string[],
	serverId?: string | null,
): Promise<void> => {
	if (!mount.credentialsId) {
		// No credentials needed (e.g., anonymous NFS)
		return;
	}

	// Get credentials from database
	const credentials = await db.query.mountCredentials.findFirst({
		where: eq(mountCredentials.credentialsId, mount.credentialsId),
	});

	if (!credentials) {
		throw new Error(`Credentials not found for mount ${mount.mountId}`);
	}

	// Decrypt credentials (only in memory)
	const decrypted = await decryptMountCredentials({
		username: credentials.username,
		password: credentials.password,
		domain: credentials.domain || undefined,
	});

	// Determine mount point path
	const mountPoint =
		mount.mountPathOnHost || `/mnt/dokploy-${mount.type}-${mount.mountId}`;

	// Create credentials directory and file on each node
	for (const nodeId of nodeIds) {
		const credsDir = `${mountPoint}/.credentials`;
		const credsFile = `${credsDir}/.smbcredentials`;

		// Create directory
		const createDirCommand = `mkdir -p ${credsDir}`;

		// Create credentials file with proper permissions
		const createFileCommand = `cat > ${credsFile} << 'EOF'
username=${decrypted.username}
password=${decrypted.password}
${decrypted.domain ? `domain=${decrypted.domain}` : ""}
EOF
chmod 600 ${credsFile}`;

		try {
			// For now, we use the same serverId for all nodes
			// In a multi-server setup, we'd need to determine the server for each node
			if (serverId) {
				await execAsyncRemote(serverId, createDirCommand);
				await execAsyncRemote(serverId, createFileCommand);
			} else {
				await execAsync(createDirCommand);
				await execAsync(createFileCommand);
			}
		} catch (error) {
			console.error(
				`Failed to distribute credentials to node ${nodeId}:`,
				error,
			);
			throw new Error(
				`Failed to distribute credentials to node ${nodeId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
};

/**
 * Ensures mount exists on all specified target swarm nodes
 */
export const syncMountToAllNodes = async (
	mount: typeof mounts.$inferSelect,
	nodeIds: string[],
	serverId?: string | null,
): Promise<Map<string, { success: boolean; error?: string }>> => {
	const mountMethod = mount.mountMethod || "host-mount";

	// Route to appropriate sync function based on mount method
	if (mountMethod === "docker-volume" && mount.type === "nfs") {
		// Use Docker volume sync
		if (!mount.dockerVolumeName || !mount.nfsServer || !mount.nfsPath) {
			throw new Error(
				"Docker volume mount missing required fields (dockerVolumeName, nfsServer, nfsPath)",
			);
		}

		return await syncDockerVolumesToNodes(
			mount.dockerVolumeName,
			mount.nfsServer,
			mount.nfsPath,
			mount.mountOptions || undefined,
			nodeIds,
			serverId,
		);
	}

	// Host-level mount sync (existing logic)
	const results = new Map<string, { success: boolean; error?: string }>();

	// Get credentials if needed
	let credentials: typeof mountCredentials.$inferSelect | undefined;
	if (mount.credentialsId) {
		credentials = await db.query.mountCredentials.findFirst({
			where: eq(mountCredentials.credentialsId, mount.credentialsId),
		});
	}

	// Determine mount point path
	const mountPoint =
		mount.mountPathOnHost || `/mnt/dokploy-${mount.type}-${mount.mountId}`;

	for (const nodeId of nodeIds) {
		try {
			// Get per-node config if available
			const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
			const finalMountPoint = nodeConfig?.mountPath || mountPoint;
			const finalMountOptions = nodeConfig?.mountOptions || mount.mountOptions;

			// Check if mount already exists
			const mountStatus = await verifyMount(finalMountPoint, serverId);
			if (mountStatus.mounted) {
				// Mount already exists, update status
				await updateMountNodeStatus(mount.mountId, nodeId, {
					mountStatus: "mounted",
					serverId: serverId || null,
				});
				results.set(nodeId, { success: true });
				continue;
			}

			// Mount doesn't exist, create it
			if (mount.type === "nfs") {
				if (!mount.nfsServer || !mount.nfsPath) {
					throw new Error("NFS mount missing server or path");
				}

				await mountNFS({
					nfsServer: mount.nfsServer,
					nfsPath: mount.nfsPath,
					mountPoint: finalMountPoint,
					mountOptions: finalMountOptions || undefined,
					serverId: serverId || null,
				});
			} else if (mount.type === "smb") {
				if (!mount.smbServer || !mount.smbShare) {
					throw new Error("SMB mount missing server or share");
				}

				await mountSMB({
					smbServer: mount.smbServer,
					smbShare: mount.smbShare,
					smbPath: mount.smbPath || undefined,
					mountPoint: finalMountPoint,
					mountOptions: finalMountOptions || undefined,
					credentials: credentials,
					serverId: serverId || null,
				});
			} else {
				throw new Error(`Unsupported mount type: ${mount.type}`);
			}

			// Verify mount was successful
			const verifyResult = await verifyMount(finalMountPoint, serverId);
			if (!verifyResult.mounted) {
				throw new Error(verifyResult.error || "Mount verification failed");
			}

			// Update status
			await updateMountNodeStatus(mount.mountId, nodeId, {
				mountStatus: "mounted",
				serverId: serverId || null,
			});

			results.set(nodeId, { success: true });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			results.set(nodeId, { success: false, error: errorMessage });

			// Update status with error
			await updateMountNodeStatus(mount.mountId, nodeId, {
				mountStatus: "failed",
				errorMessage,
				serverId: serverId || null,
			});
		}
	}

	return results;
};

/**
 * Verifies mounts on specified nodes
 */
export const verifyMountsOnNodes = async (
	mountId: string,
	nodeIds: string[],
	serverId?: string | null,
): Promise<Map<string, { mounted: boolean; error?: string }>> => {
	const mount = await db.query.mounts.findFirst({
		where: eq(mounts.mountId, mountId),
	});

	if (!mount) {
		throw new Error(`Mount ${mountId} not found`);
	}

	const results = new Map<string, { mounted: boolean; error?: string }>();

	for (const nodeId of nodeIds) {
		try {
			const mountPoint =
				mount.mountPathOnHost || `/mnt/dokploy-${mount.type}-${mount.mountId}`;

			// Get per-node config if available
			const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
			const finalMountPoint = nodeConfig?.mountPath || mountPoint;

			const verifyResult = await verifyMount(finalMountPoint, serverId);

			// Update status
			await updateMountNodeStatus(mountId, nodeId, {
				mountStatus: verifyResult.mounted ? "mounted" : "failed",
				errorMessage: verifyResult.error,
				serverId: serverId || null,
			});

			results.set(nodeId, {
				mounted: verifyResult.mounted,
				error: verifyResult.error,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			results.set(nodeId, { mounted: false, error: errorMessage });

			await updateMountNodeStatus(mountId, nodeId, {
				mountStatus: "failed",
				errorMessage,
				serverId: serverId || null,
			});
		}
	}

	return results;
};

/**
 * Removes mount and credentials from nodes when mount is deleted
 */
export const cleanupMountFromNodes = async (
	mount: typeof mounts.$inferSelect,
	nodeIds: string[],
	serverId?: string | null,
): Promise<void> => {
	const mountPoint =
		mount.mountPathOnHost || `/mnt/dokploy-${mount.type}-${mount.mountId}`;

	for (const nodeId of nodeIds) {
		try {
			// Get per-node config if available
			const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
			const finalMountPoint = nodeConfig?.mountPath || mountPoint;

			// Unmount
			const unmountCommand = `umount ${finalMountPoint} || umount -l ${finalMountPoint} || true`;

			if (serverId) {
				await execAsyncRemote(serverId, unmountCommand);
			} else {
				await execAsync(unmountCommand);
			}

			// Clean up credentials
			const cleanupCommand = `rm -rf ${finalMountPoint}/.credentials 2>/dev/null || true`;
			if (serverId) {
				await execAsyncRemote(serverId, cleanupCommand);
			} else {
				await execAsync(cleanupCommand);
			}

			// Update status
			await updateMountNodeStatus(mount.mountId, nodeId, {
				mountStatus: "unmounted",
				serverId: serverId || null,
			});
		} catch (error) {
			console.error(`Failed to cleanup mount from node ${nodeId}:`, error);
			// Continue with other nodes even if one fails
		}
	}
};

/**
 * Tests if NFS/SMB server is accessible from a specific node
 */
export const testNodeConnectivity = async (
	_nodeId: string,
	nfsServer?: string,
	smbServer?: string,
	serverId?: string | null,
): Promise<{ accessible: boolean; latency?: number; error?: string }> => {
	const startTime = Date.now();

	try {
		if (nfsServer) {
			// Test NFS connectivity (ping or port check)
			const testCommand = `timeout 5 bash -c '</dev/tcp/${nfsServer}/2049' && echo "accessible" || echo "not_accessible"`;
			let result: { stdout: string; stderr: string };

			if (serverId) {
				result = await execAsyncRemote(serverId, testCommand);
			} else {
				result = await execAsync(testCommand);
			}

			const latency = Date.now() - startTime;
			const accessible = result.stdout.trim() === "accessible";

			return {
				accessible,
				latency,
				error: accessible ? undefined : "NFS server not accessible",
			};
		}

		if (smbServer) {
			// Test SMB connectivity (ping or port check)
			const testCommand = `timeout 5 bash -c '</dev/tcp/${smbServer}/445' && echo "accessible" || echo "not_accessible"`;
			let result: { stdout: string; stderr: string };

			if (serverId) {
				result = await execAsyncRemote(serverId, testCommand);
			} else {
				result = await execAsync(testCommand);
			}

			const latency = Date.now() - startTime;
			const accessible = result.stdout.trim() === "accessible";

			return {
				accessible,
				latency,
				error: accessible ? undefined : "SMB server not accessible",
			};
		}

		return {
			accessible: false,
			error: "No server specified for connectivity test",
		};
	} catch (error) {
		return {
			accessible: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Updates or creates mount node status record
 */
const updateMountNodeStatus = async (
	mountId: string,
	nodeId: string,
	updates: {
		mountStatus?: "pending" | "mounted" | "failed" | "unmounted";
		errorMessage?: string | null;
		serverId?: string | null;
	},
): Promise<void> => {
	const existing = await db.query.mountNodeStatus.findFirst({
		where: and(
			eq(mountNodeStatus.mountId, mountId),
			eq(mountNodeStatus.nodeId, nodeId),
		),
	});

	if (existing) {
		await db
			.update(mountNodeStatus)
			.set({
				...updates,
				lastVerified: new Date(),
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(mountNodeStatus.mountId, mountId),
					eq(mountNodeStatus.nodeId, nodeId),
				),
			);
	} else {
		// Get node info for hostname
		const nodeInfo = await getNodeInfo(nodeId, updates.serverId || undefined);
		const hostname = nodeInfo?.Description?.Hostname || nodeId.substring(0, 12);

		await db.insert(mountNodeStatus).values({
			mountId,
			nodeId,
			nodeHostname: hostname,
			mountStatus: updates.mountStatus || "pending",
			errorMessage: updates.errorMessage || null,
			serverId: updates.serverId || null,
			lastVerified: new Date(),
		});
	}
};
