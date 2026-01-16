import { execAsync, execAsyncRemote } from "../process/execAsync";
import { decryptMountCredentials } from "../encryption/mount-credentials";
import { createMountError, createNetworkError } from "../errors/structured-errors";
import { retryWithBackoff, isNetworkError, isMountError } from "../errors/retry";
import type { mountCredentials } from "../../db/schema/mount-credentials";

export interface MountNFSParams {
	nfsServer: string;
	nfsPath: string;
	mountPoint: string;
	mountOptions?: string;
	credentials?: typeof mountCredentials.$inferSelect;
	serverId?: string | null;
}

export interface MountSMBParams {
	smbServer: string;
	smbShare: string;
	smbPath?: string;
	mountPoint: string;
	mountOptions?: string;
	credentials?: typeof mountCredentials.$inferSelect;
	serverId?: string | null;
}

/**
 * Creates a secure credentials file for mounting
 * Returns the path to the credentials file
 */
const createCredentialsFile = async (
	credentials: typeof mountCredentials.$inferSelect,
	mountPoint: string,
	serverId?: string | null,
): Promise<string> => {
	const decrypted = await decryptMountCredentials({
		username: credentials.username,
		password: credentials.password,
		domain: credentials.domain || undefined,
	});

	const credsDir = `${mountPoint}/.credentials`;
	const credsFile = `${credsDir}/.smbcredentials`;

	const createDirCommand = `mkdir -p ${credsDir}`;
	const createFileCommand = `cat > ${credsFile} << 'EOF'
username=${decrypted.username}
password=${decrypted.password}
${decrypted.domain ? `domain=${decrypted.domain}` : ""}
EOF
chmod 600 ${credsFile}`;

	if (serverId) {
		await execAsyncRemote(serverId, createDirCommand);
		await execAsyncRemote(serverId, createFileCommand);
	} else {
		await execAsync(createDirCommand);
		await execAsync(createFileCommand);
	}

	return credsFile;
};

/**
 * Mounts an NFS share on the host
 */
export const mountNFS = async (params: MountNFSParams): Promise<void> => {
	const { nfsServer, nfsPath, mountPoint, mountOptions, serverId } = params;

	// Create mount point if it doesn't exist
	const createMountPointCommand = `mkdir -p ${mountPoint}`;
	if (serverId) {
		await execAsyncRemote(serverId, createMountPointCommand);
	} else {
		await execAsync(createMountPointCommand);
	}

	// Build mount command
	const mountSource = `${nfsServer}:${nfsPath}`;
	const options = mountOptions || "vers=4.0,soft,timeo=30";
	const mountCommand = `mount -t nfs -o ${options} ${mountSource} ${mountPoint}`;

	try {
		await retryWithBackoff(
			async () => {
				if (serverId) {
					await execAsyncRemote(serverId, mountCommand);
				} else {
					await execAsync(mountCommand);
				}
			},
			{
				maxRetries: 3,
				retryCondition: (error) => isNetworkError(error) || isMountError(error),
			},
		);
	} catch (error) {
		throw createMountError(
			`Failed to mount NFS share ${mountSource} to ${mountPoint}`,
			{
				mountType: "nfs",
				nfsServer,
				nfsPath,
				mountPoint,
				originalError: error instanceof Error ? error.message : String(error),
			},
		);
	}
};

/**
 * Mounts an SMB/CIFS share on the host
 */
export const mountSMB = async (params: MountSMBParams): Promise<void> => {
	const {
		smbServer,
		smbShare,
		smbPath,
		mountPoint,
		mountOptions,
		credentials,
		serverId,
	} = params;

	// Create mount point if it doesn't exist
	const createMountPointCommand = `mkdir -p ${mountPoint}`;
	if (serverId) {
		await execAsyncRemote(serverId, createMountPointCommand);
	} else {
		await execAsync(createMountPointCommand);
	}

	// Build mount source
	const mountSource = smbPath
		? `//${smbServer}/${smbShare}/${smbPath}`
		: `//${smbServer}/${smbShare}`;

	// Build mount options
	let options = mountOptions || "vers=3.0";
	if (credentials) {
		const credsFile = await createCredentialsFile(
			credentials,
			mountPoint,
			serverId,
		);
		options += `,credentials=${credsFile}`;
	}

	const mountCommand = `mount -t cifs -o ${options} ${mountSource} ${mountPoint}`;

	try {
		await retryWithBackoff(
			async () => {
				if (serverId) {
					await execAsyncRemote(serverId, mountCommand);
				} else {
					await execAsync(mountCommand);
				}
			},
			{
				maxRetries: 3,
				retryCondition: (error) => isNetworkError(error) || isMountError(error),
			},
		);
	} catch (error) {
		throw createMountError(
			`Failed to mount SMB share ${mountSource} to ${mountPoint}`,
			{
				mountType: "smb",
				smbServer,
				smbShare,
				smbPath,
				mountPoint,
				originalError: error instanceof Error ? error.message : String(error),
			},
		);
	}
};

/**
 * Unmounts a network share (NFS or SMB)
 */
export const unmountNetworkShare = async (
	mountPoint: string,
	serverId?: string | null,
): Promise<void> => {
	const unmountCommand = `umount ${mountPoint} || umount -l ${mountPoint}`;

	try {
		if (serverId) {
			await execAsyncRemote(serverId, unmountCommand);
		} else {
			await execAsync(unmountCommand);
		}

		// Clean up credentials file if it exists
		const cleanupCommand = `rm -rf ${mountPoint}/.credentials 2>/dev/null || true`;
		if (serverId) {
			await execAsyncRemote(serverId, cleanupCommand);
		} else {
			await execAsync(cleanupCommand);
		}
	} catch (error) {
		// Try lazy unmount if regular unmount fails
		const lazyUnmountCommand = `umount -l ${mountPoint} || true`;
		if (serverId) {
			await execAsyncRemote(serverId, lazyUnmountCommand);
		} else {
			await execAsync(lazyUnmountCommand);
		}
	}
};

/**
 * Verifies that a mount point is accessible and mounted
 */
export const verifyMount = async (
	mountPoint: string,
	serverId?: string | null,
): Promise<{ mounted: boolean; error?: string }> => {
	// Check if mount point exists and is a directory
	const checkMountPointCommand = `test -d ${mountPoint} && echo "exists" || echo "missing"`;
	let mountPointExists: string;

	if (serverId) {
		const result = await execAsyncRemote(serverId, checkMountPointCommand);
		mountPointExists = result.stdout.trim();
	} else {
		const result = await execAsync(checkMountPointCommand);
		mountPointExists = result.stdout.trim();
	}

	if (mountPointExists !== "exists") {
		return {
			mounted: false,
			error: `Mount point ${mountPoint} does not exist`,
		};
	}

	// Check if it's actually mounted by checking /proc/mounts or mount command
	const checkMountedCommand = `mountpoint -q ${mountPoint} && echo "mounted" || echo "not_mounted"`;
	let isMounted: string;

	try {
		if (serverId) {
			const result = await execAsyncRemote(serverId, checkMountedCommand);
			isMounted = result.stdout.trim();
		} else {
			const result = await execAsync(checkMountedCommand);
			isMounted = result.stdout.trim();
		}

		if (isMounted === "mounted") {
			// Try to read from the mount to verify it's accessible
			const testReadCommand = `test -r ${mountPoint} && echo "readable" || echo "not_readable"`;
			let isReadable: string;

			if (serverId) {
				const result = await execAsyncRemote(serverId, testReadCommand);
				isReadable = result.stdout.trim();
			} else {
				const result = await execAsync(testReadCommand);
				isReadable = result.stdout.trim();
			}

			if (isReadable === "readable") {
				return { mounted: true };
			}
			return {
				mounted: false,
				error: `Mount point ${mountPoint} is mounted but not readable`,
			};
		}

		return {
			mounted: false,
			error: `Mount point ${mountPoint} is not mounted`,
		};
	} catch (error) {
		return {
			mounted: false,
			error: `Failed to verify mount: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};

/**
 * Gets the mount status from /proc/mounts
 */
export const getMountStatus = async (
	mountPoint: string,
	serverId?: string | null,
): Promise<{ mounted: boolean; type?: string; source?: string }> => {
	const checkCommand = `grep -E "^[^ ]+ ${mountPoint} " /proc/mounts | head -1 || echo ""`;
	let output: string;

	if (serverId) {
		const result = await execAsyncRemote(serverId, checkCommand);
		output = result.stdout.trim();
	} else {
		const result = await execAsync(checkCommand);
		output = result.stdout.trim();
	}

	if (!output) {
		return { mounted: false };
	}

	// Parse /proc/mounts format: device mountpoint fstype options dump pass
	const parts = output.split(/\s+/);
	if (parts.length >= 3) {
		return {
			mounted: true,
			source: parts[0],
			type: parts[2],
		};
	}

	return { mounted: true };
};

