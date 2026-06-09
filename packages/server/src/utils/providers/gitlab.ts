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
	const baseUrl = gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl;
	const response = await fetch(`${baseUrl}/oauth/token`, {
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
	gitlab: GitlabInfo,
	gitlabPathNamespace: string | null,
) => {
	const url = gitlab?.gitlabInternalUrl || gitlab?.gitlabUrl;
	const repoClone = `${url?.replace(/^https?:\/\//, "")}/${gitlabPathNamespace}.git`;
	return repoClone;
};

const getGitlabCloneUrl = (gitlab: GitlabInfo, repoClone: string) => {
	const url = gitlab?.gitlabInternalUrl || gitlab?.gitlabUrl;
	const isSecure = url?.startsWith("https://");
	const cloneUrl = `http${isSecure ? "s" : ""}://oauth2:${gitlab?.accessToken}@${repoClone}`;
	return cloneUrl;
};

interface GitlabProjectHook {
	id: number;
	url: string;
}

interface RegisterGitlabDeployWebhookInput {
	gitlabId: string;
	gitlabProjectId: number | null;
	branch: string;
	deployWebhookUrl: string;
}

const createGitlabHookPayload = ({
	branch,
	deployWebhookUrl,
}: Pick<RegisterGitlabDeployWebhookInput, "branch" | "deployWebhookUrl">) => ({
	url: deployWebhookUrl,
	push_events: true,
	enable_ssl_verification: true,
	push_events_branch_filter: branch,
	branch_filter_strategy: "wildcard",
});

const getGitlabApiBaseUrl = (gitlabProvider: Gitlab) => {
	return (gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl).replace(
		/\/+$/,
		"",
	);
};

const getGitlabApiHeaders = (accessToken: string | null) => {
	if (!accessToken) {
		throw new Error("GitLab provider access token not found");
	}

	return {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
	};
};

const getGitlabHookErrorMessage = async (response: Response) => {
	const body = await response.text();

	if (!body) {
		return response.statusText;
	}

	try {
		const parsed = JSON.parse(body);
		if (typeof parsed.message === "string") {
			return parsed.message;
		}
		if (parsed.message) {
			return JSON.stringify(parsed.message);
		}
		return body;
	} catch {
		return body;
	}
};

const throwGitlabHookError = async (action: string, response: Response) => {
	const message = await getGitlabHookErrorMessage(response);
	throw new Error(
		`Failed to ${action}: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`,
	);
};

export const registerGitlabDeployWebhook = async ({
	gitlabId,
	gitlabProjectId,
	branch,
	deployWebhookUrl,
}: RegisterGitlabDeployWebhookInput) => {
	if (!gitlabProjectId) {
		throw new Error("GitLab project ID is required to register webhook");
	}

	const gitlabProvider = await findGitlabById(gitlabId);
	if (!gitlabProvider.enableAutoDeploy) {
		return null;
	}

	await refreshGitlabToken(gitlabId);
	const baseUrl = getGitlabApiBaseUrl(gitlabProvider);
	const hooksUrl = `${baseUrl}/api/v4/projects/${gitlabProjectId}/hooks`;
	const headers = getGitlabApiHeaders(gitlabProvider.accessToken);
	const payload = createGitlabHookPayload({ branch, deployWebhookUrl });

	const hooksResponse = await fetch(`${hooksUrl}?per_page=100`, {
		headers,
	});

	if (!hooksResponse.ok) {
		await throwGitlabHookError("fetch GitLab project hooks", hooksResponse);
	}

	const hooks = (await hooksResponse.json()) as GitlabProjectHook[];
	const existingHook = hooks.find((hook) => hook.url === deployWebhookUrl);

	const response = await fetch(
		existingHook ? `${hooksUrl}/${existingHook.id}` : hooksUrl,
		{
			method: existingHook ? "PUT" : "POST",
			headers,
			body: JSON.stringify(payload),
		},
	);

	if (!response.ok) {
		await throwGitlabHookError(
			existingHook
				? "update GitLab project webhook"
				: "create GitLab project webhook",
			response,
		);
	}

	return await response.json();
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
		command += `echo "Error: ❌ Gitlab Provider not found"; exit 1;`;
		return command;
	}

	await refreshGitlabToken(gitlabId);
	const gitlab = await findGitlabById(gitlabId);

	const requirements = getErrorCloneRequirements(entity);

	// Check if requirements are met
	if (requirements.length > 0) {
		command += `echo "❌ [ERROR] GitLab Repository configuration failed for application: ${appName}"; echo "Reasons:"; echo "${requirements.join("\n")}"; exit 1;`;
		return command;
	}

	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = outputPathOverride ?? join(basePath, appName, "code");
	command += `rm -rf ${outputPath};`;
	command += `mkdir -p ${outputPath};`;
	const repoClone = getGitlabRepoClone(gitlab, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlab, repoClone);
	command += `echo "Cloning Repo ${repoClone} to ${outputPath}: ✅";`;
	command += `git clone --branch ${gitlabBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${cloneUrl} ${outputPath} --progress;`;
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
		const groupName = gitlabProvider.groupName?.toLowerCase();

		if (groupName) {
			return groupName
				.split(",")
				.some((name: string) =>
					full_path.toLowerCase().startsWith(name.trim().toLowerCase()),
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
}) => {
	if (!input.gitlabId || !input.id || input.id === 0) {
		return [];
	}

	const gitlabProvider = await findGitlabById(input.gitlabId);

	const allBranches = [];
	let page = 1;
	const perPage = 100; // GitLab's max per page is 100
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	while (true) {
		const branchesResponse = await fetch(
			`${baseUrl}/api/v4/projects/${input.id}/repository/branches?page=${page}&per_page=${perPage}`,
			{
				headers: {
					Authorization: `Bearer ${gitlabProvider.accessToken}`,
				},
			},
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
		if (total && allBranches.length >= Number.parseInt(total)) {
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
			return groupName
				.split(",")
				.some((name: string) =>
					full_path.toLowerCase().startsWith(name.trim().toLowerCase()),
				);
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
		const baseUrl = (
			gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
		).replace(/\/+$/, "");

		while (true) {
			const response = await fetch(
				`${baseUrl}/api/v4/projects?membership=true&page=${page}&per_page=${perPage}`,
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

			const projects = await response.json();

			if (projects.length === 0) {
				break;
			}

			allProjects.push(...projects);
			page++;

			const total = response.headers.get("x-total");
			if (total && allProjects.length >= Number.parseInt(total)) {
				break;
			}
		}

		return allProjects;
	} catch (error) {
		throw error;
	}
};
