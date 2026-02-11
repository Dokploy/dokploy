import path, { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { findSSHKeyById } from "@dokploy/server/services/ssh-key";
import { TRPCError } from "@trpc/server";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";

interface PatchRepoConfig {
	appName: string;
	type: "application" | "compose";
	gitUrl: string;
	gitBranch: string;
	sshKeyId?: string | null;
	serverId?: string | null;
}

/**
 * Ensure patch repo exists and is up-to-date
 * Returns path to the repo
 */
export const ensurePatchRepo = async ({
	appName,
	type,
	gitUrl,
	gitBranch,
	sshKeyId,
	serverId,
}: PatchRepoConfig): Promise<string> => {
	const { PATCH_REPOS_PATH, SSH_PATH } = paths(!!serverId);
	const repoPath = join(PATCH_REPOS_PATH, type, appName);
	const knownHostsPath = path.join(SSH_PATH, "known_hosts");

	// Check if repo exists
	const checkCommand = `test -d "${repoPath}/.git" && echo "exists" || echo "not_exists"`;

	let exists = false;
	if (serverId) {
		const result = await execAsyncRemote(serverId, checkCommand);
		exists = result.stdout.trim() === "exists";
	} else {
		const result = await execAsync(checkCommand);
		exists = result.stdout.trim() === "exists";
	}

	// Setup SSH if needed
	let sshSetup = "";
	if (sshKeyId) {
		const sshKey = await findSSHKeyById(sshKeyId);
		const temporalKeyPath = "/tmp/patch_repo_id_rsa";
		sshSetup = `
echo "${sshKey.privateKey}" > ${temporalKeyPath};
chmod 600 ${temporalKeyPath};
export GIT_SSH_COMMAND="ssh -i ${temporalKeyPath} -o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=accept-new";
`;
	}

	if (!exists) {
		// Clone the repo
		const cloneCommand = `
set -e;
${sshSetup}
mkdir -p "${repoPath}";
git clone --branch ${gitBranch} --progress "${gitUrl}" "${repoPath}";
echo "Repository cloned successfully";
`;

		try {
			if (serverId) {
				await execAsyncRemote(serverId, cloneCommand);
			} else {
				await execAsync(cloneCommand);
			}
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to clone repository: ${error}`,
			});
		}
	} else {
	// Repo exists - check if on correct branch and update
		const updateCommand = `
set -e;
cd "${repoPath}";
${sshSetup}

# Fetch all updates including tags
git fetch origin --tags --force

# Checkout the target (branch or tag) - this handles switching branches/tags
git checkout --force "${gitBranch}"

# If it's a branch that corresponds to a remote branch, hard reset to match remote
# This ensures we pull the latest changes for that branch.
# If it's a tag, we are already at the correct commit after checkout.
if git rev-parse --verify "origin/${gitBranch}" >/dev/null 2>&1; then
    git reset --hard "origin/${gitBranch}"
fi

echo "Updated repository to ${gitBranch}"
`;

		try {
			if (serverId) {
				await execAsyncRemote(serverId, updateCommand);
			} else {
				await execAsync(updateCommand);
			}
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Failed to update repository: ${error}`,
			});
		}
	}

	return repoPath;
};

interface DirectoryEntry {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: DirectoryEntry[];
}

/**
 * Read directory tree of the patch repo
 */
export const readPatchRepoDirectory = async (
	repoPath: string,
	serverId?: string | null,
): Promise<DirectoryEntry[]> => {
	// Use git ls-tree to get tracked files only
	const command = `cd "${repoPath}" && git ls-tree -r --name-only HEAD`;

	let stdout: string;
	try {
		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			stdout = result.stdout;
		} else {
			const result = await execAsync(command);
			stdout = result.stdout;
		}
	} catch (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Failed to read repository: ${error}`,
		});
	}

	const files = stdout.trim().split("\n").filter(Boolean);

	// Build tree structure
	const root: DirectoryEntry[] = [];
	const dirMap = new Map<string, DirectoryEntry>();

	for (const filePath of files) {
		const parts = filePath.split("/");
		let currentPath = "";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!part) continue;
			
			const isFile = i === parts.length - 1;
			const parentPath = currentPath;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!dirMap.has(currentPath)) {
				const entry: DirectoryEntry = {
					name: part,
					path: currentPath,
					type: isFile ? "file" : "directory",
					children: isFile ? undefined : [],
				};

				dirMap.set(currentPath, entry);

				if (parentPath) {
					const parent = dirMap.get(parentPath);
					parent?.children?.push(entry);
				} else {
					root.push(entry);
				}
			}
		}
	}

	return root;
};

interface ReadFileResult {
	content: string;
	patchError?: boolean;
	patchErrorMessage?: string;
}

/**
 * Read file content from patch repo, optionally with patch applied
 */
export const readPatchRepoFile = async (
	repoPath: string,
	filePath: string,
	patchContent?: string,
	serverId?: string | null,
): Promise<ReadFileResult> => {
	const fullPath = join(repoPath, filePath);

	// Read original file
	const command = `cat "${fullPath}" 2>/dev/null || echo "__FILE_NOT_FOUND__"`;

	let content: string;
	try {
		if (serverId) {
			const result = await execAsyncRemote(serverId, command);
			content = result.stdout;
		} else {
			const result = await execAsync(command);
			content = result.stdout;
		}
	} catch (error) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `File not found: ${filePath}`,
		});
	}

	if (content.trim() === "__FILE_NOT_FOUND__") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `File not found: ${filePath}`,
		});
	}

	// If no patch, return original content
	if (!patchContent) {
		return { content };
	}

	// Try to apply patch
	const tempDir = `/tmp/patch_apply_${Date.now()}`;
	const encodedContent = Buffer.from(content).toString("base64");
	const encodedPatch = Buffer.from(patchContent).toString("base64");

	// We need to recreate the file structure for git apply to work
	// git diff usually uses paths relative to repo root
	const applyCommand = `
set -e;
mkdir -p "${tempDir}";
cd "${tempDir}";
git init -q;
# Create file with correct path
mkdir -p "$(dirname "${filePath}")";
echo "${encodedContent}" | base64 -d > "${filePath}";
# Save patch
echo "${encodedPatch}" | base64 -d > "patch.diff";
# Apply patch
git apply --ignore-space-change --ignore-whitespace patch.diff;
# Read result
cat "${filePath}";
rm -rf "${tempDir}";
`;

	try {
		let patchedContent: string;
		if (serverId) {
			const result = await execAsyncRemote(serverId, applyCommand);
			patchedContent = result.stdout;
		} else {
			const result = await execAsync(applyCommand);
			patchedContent = result.stdout;
		}
		return { content: patchedContent };
	} catch (error) {
		// Patch failed - return original content with error
		const cleanupCommand = `rm -rf "${tempDir}" 2>/dev/null || true`;
		try {
			if (serverId) {
				await execAsyncRemote(serverId, cleanupCommand);
			} else {
				await execAsync(cleanupCommand);
			}
		} catch {
			// Ignore cleanup errors
		}

		return {
			content,
			patchError: true,
			patchErrorMessage: `Failed to apply patch: ${error}`,
		};
	}
};

/**
 * Clean all patch repos
 */
export const cleanPatchRepos = async (serverId?: string | null): Promise<void> => {
	const { PATCH_REPOS_PATH } = paths(!!serverId);

	const command = `rm -rf "${PATCH_REPOS_PATH}"/* 2>/dev/null || true`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
