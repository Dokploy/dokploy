import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { TRPCError } from "@trpc/server";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { cloneBitbucketRepository } from "../utils/providers/bitbucket";
import { cloneGitRepository } from "../utils/providers/git";
import { cloneGiteaRepository } from "../utils/providers/gitea";
import { cloneGithubRepository } from "../utils/providers/github";
import { cloneGitlabRepository } from "../utils/providers/gitlab";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";

interface PatchRepoConfig {
	type: "application" | "compose";
	id: string;
}

/**
 * Ensure patch repo exists and is up-to-date
 * Returns path to the repo
 */
export const ensurePatchRepo = async ({
	type,
	id,
}: PatchRepoConfig): Promise<string> => {
	let serverId: string | null = null;

	if (type === "application") {
		const application = await findApplicationById(id);
		serverId = application.buildServerId || application.serverId;
	} else {
		const compose = await findComposeById(id);
		serverId = compose.serverId;
	}

	const application =
		type === "application"
			? await findApplicationById(id)
			: await findComposeById(id);

	const { PATCH_REPOS_PATH } = paths(!!serverId);
	const repoPath = join(PATCH_REPOS_PATH, type, application.appName);

	const applicationEntity = {
		...application,
		type,
		serverId: serverId,
		outputPathOverride: repoPath,
	};

	let command = "set -e;";
	if (application.sourceType === "github") {
		command += await cloneGithubRepository(applicationEntity);
	} else if (application.sourceType === "gitlab") {
		command += await cloneGitlabRepository(applicationEntity);
	} else if (application.sourceType === "gitea") {
		command += await cloneGiteaRepository(applicationEntity);
	} else if (application.sourceType === "bitbucket") {
		command += await cloneBitbucketRepository(applicationEntity);
	} else if (application.sourceType === "git") {
		command += await cloneGitRepository(applicationEntity);
	}

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
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

export const readPatchRepoFile = async (
	id: string,
	type: "application" | "compose",
	filePath: string,
) => {
	let serverId: string | null = null;

	if (type === "application") {
		const application = await findApplicationById(id);
		serverId = application.buildServerId || application.serverId;
	} else {
		const compose = await findComposeById(id);
		serverId = compose.serverId;
	}
	const { PATCH_REPOS_PATH } = paths(!!serverId);

	const application =
		type === "application"
			? await findApplicationById(id)
			: await findComposeById(id);

	const repoPath = join(PATCH_REPOS_PATH, type, application.appName);
	const fullPath = join(repoPath, filePath);

	const command = `cat "${fullPath}"`;

	if (serverId) {
		const result = await execAsyncRemote(serverId, command);
		return result.stdout;
	}

	const result = await execAsync(command);
	return result.stdout;
};

/**
 * Clean all patch repos
 */
export const cleanPatchRepos = async (
	serverId?: string | null,
): Promise<void> => {
	const { PATCH_REPOS_PATH } = paths(!!serverId);

	const command = `rm -rf "${PATCH_REPOS_PATH}"/* 2>/dev/null || true`;

	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};
