import { db } from "../../db";
import { mountCredentials } from "../../db/schema/mount-credentials";
import { mounts } from "../../db/schema/mount";
import { eq } from "drizzle-orm";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import {
	mountNFS,
	mountSMB,
	unmountNetworkShare,
	getMountStatus,
} from "./host-mount";

/**
 * Mounts NFS/SMB on a specific swarm node
 */
export const mountOnNode = async (
	mount: typeof mounts.$inferSelect,
	nodeId: string,
	serverId?: string | null,
): Promise<{ success: boolean; error?: string }> => {
	try {
		const mountPoint =
			mount.mountPathOnHost ||
			`/mnt/dokploy-${mount.type}-${mount.mountId}`;

		// Get per-node config if available
		const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
		const finalMountPoint = nodeConfig?.mountPath || mountPoint;
		const finalMountOptions = nodeConfig?.mountOptions || mount.mountOptions;

		// Get credentials if needed
		let credentials: typeof mountCredentials.$inferSelect | undefined;
		if (mount.credentialsId) {
			credentials = await db.query.mountCredentials.findFirst({
				where: eq(mountCredentials.credentialsId, mount.credentialsId),
			});
		}

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

		// Verify mount
		const verifyResult = await getMountStatus(finalMountPoint, serverId);
		if (!verifyResult.mounted) {
			throw new Error("Mount created but verification failed");
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Unmounts from a specific node
 * Checks if mount is in use by any containers before unmounting
 */
export const unmountFromNode = async (
	mount: typeof mounts.$inferSelect,
	nodeId: string,
	serverId?: string | null,
): Promise<{ success: boolean; error?: string }> => {
	try {
		const mountPoint =
			mount.mountPathOnHost ||
			`/mnt/dokploy-${mount.type}-${mount.mountId}`;

		// Get per-node config if available
		const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
		const finalMountPoint = nodeConfig?.mountPath || mountPoint;

		// Check if mount is in use by any containers
		// This is a simple check - in production you might want more sophisticated detection
		const checkInUseCommand = `lsof ${finalMountPoint} 2>/dev/null | grep -q . && echo "in_use" || echo "not_in_use"`;
		let inUse: string;

		if (serverId) {
			const result = await execAsyncRemote(serverId, checkInUseCommand);
			inUse = result.stdout.trim();
		} else {
			const result = await execAsync(checkInUseCommand);
			inUse = result.stdout.trim();
		}

		if (inUse === "in_use") {
			return {
				success: false,
				error: "Mount is currently in use by containers",
			};
		}

		// Safe to unmount
		await unmountNetworkShare(finalMountPoint, serverId);

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Gets mount status on a node
 */
export const getNodeMountStatus = async (
	mount: typeof mounts.$inferSelect,
	nodeId: string,
	serverId?: string | null,
): Promise<{ mounted: boolean; type?: string; source?: string; error?: string }> => {
	try {
		const mountPoint =
			mount.mountPathOnHost ||
			`/mnt/dokploy-${mount.type}-${mount.mountId}`;

		// Get per-node config if available
		const nodeConfig = mount.nodeSpecificConfig?.[nodeId];
		const finalMountPoint = nodeConfig?.mountPath || mountPoint;

		const status = await getMountStatus(finalMountPoint, serverId);
		return status;
	} catch (error) {
		return {
			mounted: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

