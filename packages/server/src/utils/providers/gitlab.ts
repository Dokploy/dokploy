import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { apiGitlabTestConnection } from "@dokploy/server/db/schema";
import {
	findGitlabById,
	type Gitlab,
	updateGitlab,
} from "@dokploy/server/services/gitlab";
import type { ChangeRequest } from "@dokploy/server/types/change-request";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
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
	const tokenUrl = new URL(baseUrl);
	const response = await fetch(
		`${tokenUrl.origin}${tokenUrl.pathname.replace(/\/$/, "")}/oauth/token`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			redirect: "manual",
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: gitlabProvider.refreshToken as string,
				client_id: gitlabProvider.applicationId as string,
				client_secret: gitlabProvider.secret as string,
			}),
		},
	);

	if (!response.ok) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: `GitLab token expired or was revoked. Reconnect the GitLab provider in Settings → Git. (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""})`,
		});
	}

	const data = await response.json();

	const expiresAt = data.expires_in
		? Math.floor(Date.now() / 1000) + data.expires_in
		: null;

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
	command += `echo ${quote([`Cloning Repo ${repoClone} to ${outputPath}: ✅`])};`;
	command += `git clone --branch ${quote([String(gitlabBranch ?? "")])} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${quote([String(cloneUrl ?? "")])} ${quote([String(outputPath ?? "")])} --progress;`;
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

	// GitLab OAuth access tokens are short lived; without this the listing 401s
	// as soon as the stored token expires, like every other helper here does.
	await refreshGitlabToken(input.gitlabId);
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

interface GitlabMergeRequest {
	id: number;
	iid: number;
	title: string;
	web_url: string;
	source_branch: string;
	target_branch: string;
	draft: boolean;
	author?: {
		id?: number;
		username?: string;
	} | null;
}

export const getGitlabMergeRequests = async (input: {
	id?: number;
	gitlabId?: string;
	owner: string;
	repo: string;
}): Promise<ChangeRequest[]> => {
	if (!input.gitlabId || !input.id || input.id === 0) {
		return [];
	}

	// GitLab OAuth access tokens are short lived; without this the listing 401s
	// as soon as the stored token expires, like every other helper here does.
	await refreshGitlabToken(input.gitlabId);
	const gitlabProvider = await findGitlabById(input.gitlabId);

	const allMergeRequests: GitlabMergeRequest[] = [];
	let page = 1;
	const perPage = 100; // GitLab's max per page is 100
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	while (true) {
		const mergeRequestsResponse = await fetch(
			`${baseUrl}/api/v4/projects/${input.id}/merge_requests?state=opened&page=${page}&per_page=${perPage}`,
			{
				headers: {
					Authorization: `Bearer ${gitlabProvider.accessToken}`,
				},
			},
		);

		if (!mergeRequestsResponse.ok) {
			throw new Error(
				`Failed to fetch merge requests: ${mergeRequestsResponse.statusText}`,
			);
		}

		const mergeRequests =
			(await mergeRequestsResponse.json()) as GitlabMergeRequest[];

		if (mergeRequests.length === 0) {
			break;
		}

		allMergeRequests.push(...mergeRequests);
		page++;

		const total = mergeRequestsResponse.headers.get("x-total");
		if (total && allMergeRequests.length >= Number.parseInt(total)) {
			break;
		}
	}

	return allMergeRequests.map((mr) => ({
		id: mr.id,
		number: mr.iid,
		title: mr.title,
		url: mr.web_url,
		branch: mr.source_branch,
		baseBranch: mr.target_branch,
		draft: mr.draft,
		// `author.id` is the same identity the MR webhook authorizes through
		// `object_attributes.author_id`; keep it so the manual path can reuse
		// `checkGitlabMemberPermissionsByUserId`.
		authorUsername: mr.author?.username ?? null,
		authorId: mr.author?.id ?? null,
	}));
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

export const checkGitlabMemberPermissions = async (
	gitlabId: string,
	projectId: number,
	username: string,
): Promise<{ hasWriteAccess: boolean; accessLevel: number | null }> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	// Resolve username → user ID
	const userResponse = await fetch(
		`${baseUrl}/api/v4/users?username=${encodeURIComponent(username)}`,
		{ headers: { Authorization: `Bearer ${gitlabProvider.accessToken}` } },
	);

	if (!userResponse.ok) {
		throw new Error(
			`Failed to resolve GitLab user: ${userResponse.statusText}`,
		);
	}

	const users = await userResponse.json();
	const userId = users[0]?.id;

	if (!userId) {
		return { hasWriteAccess: false, accessLevel: null };
	}

	// Check project membership
	const memberResponse = await fetch(
		`${baseUrl}/api/v4/projects/${projectId}/members/all/${userId}`,
		{ headers: { Authorization: `Bearer ${gitlabProvider.accessToken}` } },
	);

	if (memberResponse.status === 404) {
		return { hasWriteAccess: false, accessLevel: null };
	}

	if (!memberResponse.ok) {
		throw new Error(
			`Failed to fetch project member: ${memberResponse.statusText}`,
		);
	}

	const member = await memberResponse.json();
	// Developer (30) is the minimum access level for write access
	return {
		hasWriteAccess: member.access_level >= 30,
		accessLevel: member.access_level,
	};
};

/**
 * Authorize by the MR author's numeric GitLab user id (from
 * `object_attributes.author_id`). Prefer this over the username-based check when
 * handling Merge Request webhooks: `body.user` is the event *actor* (the member
 * who labeled/updated/reopened the MR), not the MR author, so a username-based
 * check can be bypassed by having any privileged member interact with an
 * untrusted MR. The author id identifies whose code would actually be deployed.
 */
export const checkGitlabMemberPermissionsByUserId = async (
	gitlabId: string,
	projectId: number,
	userId: number,
): Promise<{
	hasWriteAccess: boolean;
	accessLevel: number | null;
	username?: string | null;
}> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	const memberResponse = await fetch(
		`${baseUrl}/api/v4/projects/${projectId}/members/all/${userId}`,
		{ headers: { Authorization: `Bearer ${gitlabProvider.accessToken}` } },
	);

	if (memberResponse.status === 404) {
		return { hasWriteAccess: false, accessLevel: null, username: null };
	}

	if (!memberResponse.ok) {
		throw new Error(
			`Failed to fetch project member: ${memberResponse.statusText}`,
		);
	}

	const member = await memberResponse.json();
	// Developer (30) is the minimum access level for write access
	return {
		hasWriteAccess: member.access_level >= 30,
		accessLevel: member.access_level,
		username: (member.username as string | undefined) ?? null,
	};
};

export const mrNoteExists = async (
	gitlabId: string,
	projectId: number,
	mrIid: number,
	noteId: number,
): Promise<boolean> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	const response = await fetch(
		`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes/${noteId}`,
		{ headers: { Authorization: `Bearer ${gitlabProvider.accessToken}` } },
	);
	return response.ok;
};

const SECURITY_SENTINEL = "🚨 Preview Deployment Blocked - Security Protection";

export const hasExistingSecurityMRNote = async (
	gitlabId: string,
	projectId: number,
	mrIid: number,
): Promise<boolean> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	let page = 1;
	while (true) {
		const response = await fetch(
			`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes?per_page=100&page=${page}`,
			{ headers: { Authorization: `Bearer ${gitlabProvider.accessToken}` } },
		);
		if (!response.ok) {
			return false;
		}
		const notes: { id: number; body: string }[] = await response.json();
		if (notes.some((note) => note.body.includes(SECURITY_SENTINEL))) {
			return true;
		}
		const nextPage = response.headers.get("x-next-page");
		if (!nextPage) {
			break;
		}
		page = Number(nextPage);
	}
	return false;
};

export const createMergeRequestNote = async (
	gitlabId: string,
	projectId: number,
	mrIid: number,
	body: string,
): Promise<number> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	const response = await fetch(
		`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${gitlabProvider.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ body }),
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to create MR note: ${response.statusText}`);
	}

	const data = await response.json();
	return data.id as number;
};

export const updateMergeRequestNote = async (
	gitlabId: string,
	projectId: number,
	mrIid: number,
	noteId: number,
	body: string,
): Promise<void> => {
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const baseUrl = (
		gitlabProvider.gitlabInternalUrl || gitlabProvider.gitlabUrl
	).replace(/\/+$/, "");

	const response = await fetch(
		`${baseUrl}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes/${noteId}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${gitlabProvider.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ body }),
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to update MR note: ${response.statusText}`);
	}
};

export const createSecurityBlockedMRNote = async (
	gitlabId: string,
	projectId: number,
	mrIid: number,
	mrAuthor: string,
	repositoryName: string,
	accessLevel: number | null,
): Promise<void> => {
	const alreadyPosted = await hasExistingSecurityMRNote(
		gitlabId,
		projectId,
		mrIid,
	);
	if (alreadyPosted) return;

	const accessLevelLabel =
		accessLevel === null
			? "none (not a project member)"
			: `${accessLevel} (${accessLevel >= 30 ? "Developer+" : "below Developer"})`;

	const body = [
		`### ${SECURITY_SENTINEL}`,
		"",
		`**${mrAuthor}** does not have the required access to trigger preview deployments on **${repositoryName}**.`,
		"",
		`Access level: \`${accessLevelLabel}\``,
		"",
		"Preview deployments require at least **Developer** access (level 30).",
	].join("\n");

	await createMergeRequestNote(gitlabId, projectId, mrIid, body);
};
