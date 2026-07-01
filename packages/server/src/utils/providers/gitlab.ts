import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { apiGitlabTestConnection } from "@dokploy/server/db/schema";
import {
	findGitlabById,
	type Gitlab,
	updateGitlab,
} from "@dokploy/server/services/gitlab";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { fetchWithPublicEgress } from "../url/network";
import {
	buildCreateDirectoryCommand,
	buildGitCloneCommand,
	buildProviderEchoCommand,
	buildRemovePathCommand,
} from "./commands";
import { assertGitProviderBaseUrlAllowed } from "./url";

type GitlabProviderBaseUrl = {
	gitlabInternalUrl?: string | null;
	gitlabUrl: string;
};

const getGitlabProviderBaseUrl = (gitlabProvider: GitlabProviderBaseUrl) =>
	assertGitProviderBaseUrlAllowed(
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl,
		{ fieldName: "GitLab provider URL" },
	);

const getGitlabGroupNames = (groupName?: string | null) =>
	groupName
		?.split(",")
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean);

const isGitlabNamespaceInConfiguredGroup = (
	pathNamespace: string,
	groupName?: string | null,
) => {
	const normalizedPathNamespace = pathNamespace.toLowerCase();
	const groupNames = getGitlabGroupNames(groupName);

	return groupNames?.some(
		(name) =>
			normalizedPathNamespace === name ||
			normalizedPathNamespace.startsWith(`${name}/`),
	);
};

export const assertGitlabProjectScope = (
	gitlabProvider: Pick<Gitlab, "groupName">,
	input: {
		owner?: string | null;
		pathNamespace?: string | null;
		repo?: string | null;
	},
) => {
	const groupNames = getGitlabGroupNames(gitlabProvider.groupName);

	if (!groupNames?.length) {
		return;
	}

	const pathNamespace = getGitlabProjectPathNamespace(input);

	if (
		!pathNamespace ||
		!isGitlabNamespaceInConfiguredGroup(pathNamespace, gitlabProvider.groupName)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Repository is outside the configured GitLab group",
		});
	}
};

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

	// Use internal URL for token refresh when GitLab is on same instance as Dokploy
	const baseUrl = await getGitlabProviderBaseUrl(gitlabProvider);
	const response = await fetchWithPublicEgress(
		new URL("oauth/token", `${baseUrl}/`),
		{
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
		},
		{ fieldName: "GitLab provider URL" },
	);

	if (!response.ok) {
		throw new Error(`Failed to refresh token: ${response.statusText}`);
	}

	const data = await response.json();

	const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

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

export type GitlabInfo =
	| ApplicationWithGitlab["gitlab"]
	| ComposeWithGitlab["gitlab"];

const getGitlabRepoClone = (
	baseUrl: string,
	gitlabPathNamespace: string | null,
) => {
	const repoClone = `${baseUrl.replace(/^https?:\/\//, "")}/${gitlabPathNamespace}.git`;
	return repoClone;
};

const getGitlabProjectPathNamespace = (input: {
	owner?: string | null;
	pathNamespace?: string | null;
	repo?: string | null;
}) =>
	input.pathNamespace || [input.owner, input.repo].filter(Boolean).join("/");

const getGitlabCloneUrl = (
	gitlab: GitlabInfo,
	baseUrl: string,
	repoClone: string,
) => {
	const isSecure = baseUrl.startsWith("https://");
	const cloneUrl = `http${isSecure ? "s" : ""}://oauth2:${gitlab?.accessToken}@${repoClone}`;
	return cloneUrl;
};

interface CloneGitlabRepository {
	appName: string;
	gitlabBranch: string | null;
	gitlabId: string | null;
	gitlabPathNamespace: string | null;
	enableSubmodules: boolean;
	serverId: string | null;
	type?: "application" | "compose";
	outputPathOverride?: string;
}

export const cloneGitlabRepository = async ({
	type = "application",
	...entity
}: CloneGitlabRepository) => {
	let command = "set -e;";
	const {
		appName,
		gitlabBranch,
		gitlabId,
		gitlabPathNamespace,
		enableSubmodules,
		serverId,
		outputPathOverride,
	} = entity;
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(!!serverId);

	if (!gitlabId) {
		command += `${buildProviderEchoCommand("Error: ❌ Gitlab Provider not found")} exit 1;`;
		return command;
	}

	await refreshGitlabToken(gitlabId);
	const gitlab = await findGitlabById(gitlabId);
	assertGitlabProjectScope(gitlab, { pathNamespace: gitlabPathNamespace });

	const requirements = getErrorCloneRequirements(entity);

	// Check if requirements are met
	if (requirements.length > 0) {
		command += buildProviderEchoCommand(
			`❌ [ERROR] GitLab Repository configuration failed for application: ${appName}`,
		);
		command += buildProviderEchoCommand("Reasons:");
		command += `${buildProviderEchoCommand(requirements.join("\n"))} exit 1;`;
		return command;
	}

	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = outputPathOverride ?? join(basePath, appName, "code");
	command += buildRemovePathCommand(outputPath);
	command += buildCreateDirectoryCommand(outputPath);
	const baseUrl = await getGitlabProviderBaseUrl(gitlab);
	const repoClone = getGitlabRepoClone(baseUrl, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlab, baseUrl, repoClone);
	command += buildProviderEchoCommand(
		`Cloning Repo ${repoClone} to ${outputPath}: ✅`,
	);
	command += `${buildGitCloneCommand({
		branch: gitlabBranch!,
		cloneUrl,
		enableSubmodules,
		outputPath,
	})};`;
	return command;
};

export const getGitlabRepositories = async (gitlabId?: string) => {
	if (!gitlabId) {
		return [];
	}

	await refreshGitlabToken(gitlabId);

	const gitlabProvider = await findGitlabById(gitlabId);

	const allProjects = await validateGitlabProvider(gitlabProvider);

	const filteredRepos = allProjects.filter((repo: any) => {
		const { full_path, kind } = repo.namespace;

		if (gitlabProvider.groupName) {
			return isGitlabNamespaceInConfiguredGroup(
				full_path,
				gitlabProvider.groupName,
			);
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
	gitlabPathNamespace?: string;
}) => {
	if (!input.gitlabId || !input.id || input.id === 0) {
		return [];
	}

	const gitlabProvider = await findGitlabById(input.gitlabId);
	const pathNamespace = getGitlabProjectPathNamespace({
		pathNamespace: input.gitlabPathNamespace,
		owner: input.owner,
		repo: input.repo,
	});
	assertGitlabProjectScope(gitlabProvider, {
		pathNamespace,
		owner: input.owner,
		repo: input.repo,
	});

	const allBranches = [];
	let page = 1;
	const perPage = 100; // GitLab's max per page is 100
	const baseUrl = await getGitlabProviderBaseUrl(gitlabProvider);

	while (true) {
		const projectIdentifier =
			pathNamespace || input.id === undefined
				? encodeURIComponent(pathNamespace)
				: String(input.id);
		const branchesResponse = await fetchWithPublicEgress(
			new URL(
				`api/v4/projects/${projectIdentifier}/repository/branches?page=${page}&per_page=${perPage}`,
				`${baseUrl}/`,
			),
			{
				headers: {
					Authorization: `Bearer ${gitlabProvider.accessToken}`,
				},
			},
			{ fieldName: "GitLab provider URL" },
		);

		if (!branchesResponse.ok) {
			throw new Error(
				`Failed to fetch branches: ${branchesResponse.statusText}`,
			);
		}

		const branches = await branchesResponse.json();

		if (branches.length === 0) {
			break;
		}

		allBranches.push(...branches);
		page++;

		// Check if we've reached the total using headers (optional optimization)
		const total = branchesResponse.headers.get("x-total");
		if (total && allBranches.length >= Number.parseInt(total, 10)) {
			break;
		}
	}

	return allBranches as {
		id: string;
		name: string;
		commit: {
			id: string;
		};
	}[];
};

export const testGitlabConnection = async (
	input: z.infer<typeof apiGitlabTestConnection>,
) => {
	const { gitlabId, groupName } = input;

	if (!gitlabId) {
		throw new Error("Gitlab provider not found");
	}

	await refreshGitlabToken(gitlabId);

	const gitlabProvider = await findGitlabById(gitlabId);

	const repositories = await validateGitlabProvider(gitlabProvider);

	const filteredRepos = repositories.filter((repo: any) => {
		const { full_path, kind } = repo.namespace;

		if (groupName) {
			return isGitlabNamespaceInConfiguredGroup(full_path, groupName);
		}
		return kind === "user";
	});

	return filteredRepos.length;
};

export const validateGitlabProvider = async (gitlabProvider: Gitlab) => {
	try {
		const allProjects = [];
		let page = 1;
		const perPage = 100; // GitLab's max per page is 100
		const baseUrl = await getGitlabProviderBaseUrl(gitlabProvider);

		while (true) {
			const response = await fetchWithPublicEgress(
				new URL(
					`api/v4/projects?membership=true&page=${page}&per_page=${perPage}`,
					`${baseUrl}/`,
				),
				{
					headers: {
						Authorization: `Bearer ${gitlabProvider.accessToken}`,
					},
				},
				{ fieldName: "GitLab provider URL" },
			);

			if (!response.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to fetch repositories: ${response.statusText}`,
				});
			}

			const projects = await response.json();

			if (projects.length === 0) {
				break;
			}

			allProjects.push(...projects);
			page++;

			const total = response.headers.get("x-total");
			if (total && allProjects.length >= Number.parseInt(total, 10)) {
				break;
			}
		}

		return allProjects;
	} catch (error) {
		throw error;
	}
};
