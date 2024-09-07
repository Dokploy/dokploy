import { createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Compose } from "@/server/api/services/compose";
import {
	type Gitlab,
	findGitlabById,
	updateGitlab,
} from "@/server/api/services/gitlab";
import { APPLICATIONS_PATH, COMPOSE_PATH } from "@/server/constants";
import type { apiGitlabTestConnection } from "@/server/db/schema";
import type { InferResultType } from "@/server/types/with";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";

export const refreshGitlabToken = async (gitlabProviderId: string) => {
	const gitlabProvider = await findGitlabById(gitlabProviderId);
	const currentTime = Math.floor(Date.now() / 1000);

	const safetyMargin = 60;
	if (
		gitlabProvider.expiresAt &&
		currentTime + safetyMargin < gitlabProvider.expiresAt
	) {
		return;
	}

	const response = await fetch("https://gitlab.com/oauth/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: gitlabProvider.refreshToken as string,
			client_id: gitlabProvider.applicationId as string,
			client_secret: gitlabProvider.secret as string,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to refresh token: ${response.statusText}`);
	}

	const data = await response.json();

	const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

	console.log("Refreshed token");

	await updateGitlab(gitlabProviderId, {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt,
	});
	return data;
};

export const haveGitlabRequirements = (gitlabProvider: Gitlab) => {
	return !!(gitlabProvider?.accessToken && gitlabProvider?.refreshToken);
};

const getErrorCloneRequirements = (entity: {
	gitlabRepository?: string | null;
	gitlabOwner?: string | null;
	gitlabBranch?: string | null;
	gitlabPathNamespace?: string | null;
}) => {
	const reasons: string[] = [];
	const { gitlabBranch, gitlabOwner, gitlabRepository, gitlabPathNamespace } =
		entity;

	if (!gitlabRepository) reasons.push("1. Repository not assigned.");
	if (!gitlabOwner) reasons.push("2. Owner not specified.");
	if (!gitlabBranch) reasons.push("3. Branch not defined.");
	if (!gitlabPathNamespace) reasons.push("4. Path namespace not defined.");

	return reasons;
};

export type ApplicationWithGitlab = InferResultType<
	"applications",
	{ gitlab: true }
>;

export type ComposeWithGitlab = InferResultType<"compose", { gitlab: true }>;

export const cloneGitlabRepository = async (
	entity: ApplicationWithGitlab | ComposeWithGitlab,
	logPath: string,
	isCompose = false,
) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { appName, gitlabBranch, gitlabId, gitlab, gitlabPathNamespace } =
		entity;

	if (!gitlabId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	await refreshGitlabToken(gitlabId);

	const requirements = getErrorCloneRequirements(entity);

	// Check if requirements are met
	if (requirements.length > 0) {
		writeStream.write(
			`\nGitLab Repository configuration failed for application: ${appName}\n`,
		);
		writeStream.write("Reasons:\n");
		writeStream.write(requirements.join("\n"));
		writeStream.end();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error: GitLab repository information is incomplete.",
		});
	}
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `gitlab.com/${gitlabPathNamespace}.git`;
	const cloneUrl = `https://oauth2:${gitlab?.accessToken}@${repoclone}`;

	try {
		writeStream.write(`\nClonning Repo ${repoclone} to ${outputPath}: ✅\n`);
		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				gitlabBranch!,
				"--depth",
				"1",
				cloneUrl,
				outputPath,
				"--progress",
			],
			(data) => {
				if (writeStream.writable) {
					writeStream.write(data);
				}
			},
		);
		writeStream.write(`\nCloned ${repoclone}: ✅\n`);
	} catch (error) {
		writeStream.write(`ERROR Clonning: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getGitlabRepositories = async (gitlabId?: string) => {
	if (!gitlabId) {
		return [];
	}

	await refreshGitlabToken(gitlabId);

	const gitlabProvider = await findGitlabById(gitlabId);

	const response = await fetch(
		`https://gitlab.com/api/v4/projects?membership=true&owned=true&page=${0}&per_page=${100}`,
		{
			headers: {
				Authorization: `Bearer ${gitlabProvider.accessToken}`,
			},
		},
	);

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to fetch repositories: ${response.statusText}`,
		});
	}

	const repositories = await response.json();

	const filteredRepos = repositories.filter((repo: any) => {
		const { full_path, kind } = repo.namespace;
		const groupName = gitlabProvider.groupName?.toLowerCase();

		if (groupName) {
			return full_path.toLowerCase().includes(groupName) && kind === "group";
		}
		return kind === "user";
	});
	const mappedRepositories = filteredRepos.map((repo: any) => {
		return {
			id: repo.id,
			name: repo.name,
			url: repo.path_with_namespace,
			owner: {
				username: repo.namespace.path,
			},
		};
	});

	return mappedRepositories as {
		id: number;
		name: string;
		url: string;
		owner: {
			username: string;
		};
	}[];
};

export const getGitlabBranches = async (input: {
	id?: number;
	gitlabId?: string;
	owner: string;
	repo: string;
}) => {
	if (!input.gitlabId || !input.id || input.id === 0) {
		return [];
	}

	const gitlabProvider = await findGitlabById(input.gitlabId);

	const branchesResponse = await fetch(
		`https://gitlab.com/api/v4/projects/${input.id}/repository/branches`,
		{
			headers: {
				Authorization: `Bearer ${gitlabProvider.accessToken}`,
			},
		},
	);

	if (!branchesResponse.ok) {
		throw new Error(`Failed to fetch branches: ${branchesResponse.statusText}`);
	}

	const branches = await branchesResponse.json();

	return branches as {
		id: string;
		name: string;
		commit: {
			id: string;
		};
	}[];
};

export const cloneRawGitlabRepository = async (entity: Compose) => {
	const {
		appName,
		gitlabRepository,
		gitlabOwner,
		gitlabBranch,
		gitlabId,
		gitlabPathNamespace,
	} = entity;

	if (!gitlabId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	const gitlabProvider = await findGitlabById(gitlabId);

	await refreshGitlabToken(gitlabId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `gitlab.com/${gitlabPathNamespace}.git`;
	const cloneUrl = `https://oauth2:${gitlabProvider?.accessToken}@${repoclone}`;

	try {
		await spawnAsync("git", [
			"clone",
			"--branch",
			gitlabBranch!,
			"--depth",
			"1",
			cloneUrl,
			outputPath,
			"--progress",
		]);
	} catch (error) {
		throw error;
	}
};

export const testGitlabConnection = async (
	input: typeof apiGitlabTestConnection._type,
) => {
	const { gitlabId, groupName } = input;

	if (!gitlabId) {
		throw new Error("Gitlab provider not found");
	}

	await refreshGitlabToken(gitlabId);

	const gitlabProvider = await findGitlabById(gitlabId);

	const response = await fetch(
		`https://gitlab.com/api/v4/projects?membership=true&owned=true&page=${0}&per_page=${100}`,
		{
			headers: {
				Authorization: `Bearer ${gitlabProvider.accessToken}`,
			},
		},
	);

	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to fetch repositories: ${response.statusText}`,
		});
	}

	const repositories = await response.json();

	const filteredRepos = repositories.filter((repo: any) => {
		const { full_path, kind } = repo.namespace;

		if (groupName) {
			return full_path.toLowerCase().includes(groupName) && kind === "group";
		}
		return kind === "user";
	});

	return filteredRepos.length;
};
