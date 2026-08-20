import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	findGiteaById,
	type Gitea,
	updateGitea,
} from "@dokploy/server/services/gitea";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";

export const getErrorCloneRequirements = (entity: {
	giteaRepository?: string | null;
	giteaOwner?: string | null;
	giteaBranch?: string | null;
}) => {
	const reasons: string[] = [];
	const { giteaBranch, giteaOwner, giteaRepository } = entity;

	if (!giteaRepository) reasons.push("1. Repository not assigned.");
	if (!giteaOwner) reasons.push("2. Owner not specified.");
	if (!giteaBranch) reasons.push("3. Branch not defined.");

	return reasons;
};

export const refreshGiteaToken = async (giteaProviderId: string) => {
	try {
		const giteaProvider = await findGiteaById(giteaProviderId);

		if (
			!giteaProvider?.clientId ||
			!giteaProvider?.clientSecret ||
			!giteaProvider?.refreshToken
		) {
			return giteaProvider?.accessToken || null;
		}

		// Check if token is still valid (add some buffer time, e.g., 5 minutes)
		const currentTimeSeconds = Math.floor(Date.now() / 1000);
		const bufferTimeSeconds = 300; // 5 minutes

		if (
			giteaProvider.expiresAt &&
			giteaProvider.expiresAt > currentTimeSeconds + bufferTimeSeconds &&
			giteaProvider.accessToken
		) {
			// Token is still valid, no need to refresh
			return giteaProvider.accessToken;
		}

		// Token is expired or about to expire, refresh it
		// Use internal URL when Gitea is on same instance as Dokploy
		const baseUrl = giteaProvider.giteaInternalUrl || giteaProvider.giteaUrl;
		const tokenEndpoint = `${baseUrl}/login/oauth/access_token`;
		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: giteaProvider.refreshToken,
			client_id: giteaProvider.clientId,
			client_secret: giteaProvider.clientSecret,
		});

		const response = await fetch(tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: params.toString(),
		});

		if (!response.ok) {
			return giteaProvider?.accessToken || null;
		}

		const data = await response.json();
		const { access_token, refresh_token, expires_in } = data;

		if (!access_token) {
			return giteaProvider?.accessToken || null;
		}

		const expiresAt = Date.now() + (expires_in || 3600) * 1000;
		const expiresAtSeconds = Math.floor(expiresAt / 1000);

		await updateGitea(giteaProviderId, {
			accessToken: access_token,
			refreshToken: refresh_token || giteaProvider.refreshToken,
			expiresAt: expiresAtSeconds,
		});

		return access_token;
	} catch (error) {
		console.error("Error refreshing Gitea token:", error);
		const giteaProvider = await findGiteaById(giteaProviderId);
		return giteaProvider?.accessToken || null;
	}
};

const buildGiteaCloneUrl = (
	giteaUrl: string,
	accessToken: string,
	owner: string,
	repository: string,
) => {
	const protocol = giteaUrl.startsWith("http://") ? "http" : "https";
	const baseUrl = giteaUrl.replace(/^https?:\/\//, "");
	const repoClone = `${owner}/${repository}.git`;
	const cloneUrl = `${protocol}://oauth2:${accessToken}@${baseUrl}/${repoClone}`;
	return cloneUrl;
};

export type ApplicationWithGitea = InferResultType<
	"applications",
	{ gitea: true }
>;

export type ComposeWithGitea = InferResultType<"compose", { gitea: true }>;

type GiteaClone = (ApplicationWithGitea | ComposeWithGitea) & {
	serverId: string | null;
	type?: "application" | "compose";
};

interface CloneGiteaRepository {
	appName: string;
	giteaBranch: string | null;
	giteaId: string | null;
	giteaOwner: string | null;
	giteaRepository: string | null;
	enableSubmodules: boolean;
	serverId: string | null;
	type?: "application" | "compose";
	outputPathOverride?: string;
}

export const cloneGiteaRepository = async ({
	type = "application",
	...entity
}: CloneGiteaRepository) => {
	let command = "set -e;";
	const {
		appName,
		giteaBranch,
		giteaId,
		giteaOwner,
		giteaRepository,
		enableSubmodules,
		serverId,
		outputPathOverride,
	} = entity;
	const { APPLICATIONS_PATH, COMPOSE_PATH } = paths(!!serverId);

	if (!giteaId) {
		command += `echo "Error: ❌ Gitea Provider not found"; exit 1;`;
		return command;
	}

	await refreshGiteaToken(giteaId);
	const giteaProvider = await findGiteaById(giteaId);

	if (!giteaProvider) {
		command += `echo "❌ [ERROR] Gitea provider not found in the database"; exit 1;`;
		return command;
	}

	if (!giteaProvider.accessToken) {
		command += `echo "❌ [ERROR] Gitea provider is not authorized, please re-authorize it in the Git provider settings"; exit 1;`;
		return command;
	}

	const cloneRequirements = getErrorCloneRequirements({
		giteaRepository,
		giteaOwner,
		giteaBranch,
	});

	if (cloneRequirements.length > 0) {
		command += `echo ${quote([`❌ [ERROR] Repository configuration is incomplete: ${cloneRequirements.join(" ")}`])}; exit 1;`;
		return command;
	}

	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = outputPathOverride ?? join(basePath, appName, "code");
	command += `rm -rf ${outputPath};`;
	command += `mkdir -p ${outputPath};`;

	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const cloneUrl = buildGiteaCloneUrl(
		giteaProvider.giteaInternalUrl || giteaProvider.giteaUrl,
		giteaProvider.accessToken!,
		giteaOwner!,
		giteaRepository!,
	);

	command += `echo ${quote([`Cloning Repo ${repoClone} to ${outputPath}: ✅`])};`;
	command += `git clone --branch ${quote([String(giteaBranch ?? "")])} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${quote([String(cloneUrl ?? "")])} ${quote([String(outputPath ?? "")])} --progress;`;
	return command;
};

export const haveGiteaRequirements = (giteaProvider: Gitea) => {
	return !!(giteaProvider?.clientId && giteaProvider?.clientSecret);
};

export const testGiteaConnection = async (input: { giteaId: string }) => {
	try {
		const { giteaId } = input;

		if (!giteaId) {
			throw new Error("Gitea provider not found");
		}

		const giteaProvider = await findGiteaById(giteaId);
		if (!giteaProvider) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea provider not found in the database",
			});
		}

		await refreshGiteaToken(giteaId);

		const provider = await findGiteaById(giteaId);
		if (!provider || !provider.accessToken) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "No access token available. Please authorize with Gitea.",
			});
		}

		const baseUrl = (provider.giteaInternalUrl || provider.giteaUrl).replace(
			/\/+$/,
			"",
		);

		// Use /user/repos to get authenticated user's repositories with pagination
		let allRepos = 0;
		let page = 1;
		const limit = 50; // Max per page

		while (true) {
			const response = await fetch(
				`${baseUrl}/api/v1/user/repos?page=${page}&limit=${limit}`,
				{
					headers: {
						Accept: "application/json",
						Authorization: `token ${provider.accessToken}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error(
					`Failed to connect to Gitea API: ${response.status} ${response.statusText}`,
				);
			}

			const repos = await response.json();
			if (!Array.isArray(repos) || repos.length === 0) {
				break; // No more repositories
			}

			allRepos += repos.length;

			// Check if there are more pages
			if (repos.length < limit) {
				break; // Last page (fewer results than limit)
			}

			page++;
		}

		await updateGitea(giteaId, {
			lastAuthenticatedAt: Math.floor(Date.now() / 1000),
		});

		return allRepos;
	} catch (error) {
		throw error;
	}
};

export const getGiteaRepositories = async (giteaId?: string) => {
	if (!giteaId) {
		return [];
	}

	await refreshGiteaToken(giteaId);
	const giteaProvider = await findGiteaById(giteaId);

	const baseUrl = (
		giteaProvider.giteaInternalUrl || giteaProvider.giteaUrl
	).replace(/\/+$/, "");

	// Use /user/repos to get authenticated user's repositories with pagination
	let allRepositories: any[] = [];
	let page = 1;
	const limit = 50; // Max per page

	while (true) {
		const response = await fetch(
			`${baseUrl}/api/v1/user/repos?page=${page}&limit=${limit}`,
			{
				headers: {
					Accept: "application/json",
					Authorization: `token ${giteaProvider.accessToken}`,
				},
			},
		);

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Failed to fetch repositories: ${response.statusText}`,
			});
		}

		const repos = await response.json();
		if (!Array.isArray(repos) || repos.length === 0) {
			break; // No more repositories
		}

		allRepositories = [...allRepositories, ...repos];

		// Check if there are more pages
		if (repos.length < limit) {
			break; // Last page (fewer results than limit)
		}

		page++;
	}

	return (
		allRepositories?.map((repo: any) => ({
			id: repo.id,
			name: repo.name,
			url: repo.full_name,
			owner: {
				username: repo.owner.login,
			},
		})) || []
	);
};

export const getGiteaBranches = async (input: {
	giteaId?: string;
	owner: string;
	repo: string;
}) => {
	if (!input.giteaId) {
		return [];
	}

	await refreshGiteaToken(input.giteaId);

	const giteaProvider = await findGiteaById(input.giteaId);

	const baseUrl = (
		giteaProvider.giteaInternalUrl || giteaProvider.giteaUrl
	).replace(/\/+$/, "");

	// Handle pagination for branches
	let allBranches: any[] = [];
	let page = 1;
	const limit = 50; // Max per page

	while (true) {
		const response = await fetch(
			`${baseUrl}/api/v1/repos/${input.owner}/${input.repo}/branches?page=${page}&limit=${limit}`,
			{
				headers: {
					Accept: "application/json",
					Authorization: `token ${giteaProvider.accessToken}`,
				},
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch branches: ${response.statusText}`);
		}

		const branches = await response.json();
		if (!Array.isArray(branches) || branches.length === 0) {
			break; // No more branches
		}

		allBranches = [...allBranches, ...branches];

		// Check if there are more pages
		if (branches.length < limit) {
			break; // Last page (fewer results than limit)
		}

		page++;
	}

	return allBranches?.map((branch: any) => ({
		id: branch.name,
		name: branch.name,
		commit: {
			id: branch.commit.id,
		},
	})) as {
		id: string;
		name: string;
		commit: {
			id: string;
		};
	}[];
};

/**
 * Resolve the base URL used to talk to the Gitea/Forgejo REST API, preferring
 * the internal URL when Gitea runs on the same host as Dokploy.
 */
const getGiteaApiBaseUrl = (giteaProvider: {
	giteaUrl: string;
	giteaInternalUrl?: string | null;
}) =>
	(giteaProvider.giteaInternalUrl || giteaProvider.giteaUrl).replace(
		/\/+$/,
		"",
	);

interface GiteaApiRequestOptions {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	body?: unknown;
	/** Status codes that should resolve to `null` instead of throwing. */
	allowedErrorStatuses?: number[];
}

/**
 * Perform an authenticated request against the Gitea/Forgejo REST API.
 *
 * The access token is always read through `findGiteaById` because
 * `findApplicationById` redacts `accessToken` from the `gitea` relation.
 *
 * Returns `null` when the response status is listed in `allowedErrorStatuses`.
 */
export const giteaApiRequest = async <T>(
	giteaId: string,
	path: string,
	{
		method = "GET",
		body,
		allowedErrorStatuses = [],
	}: GiteaApiRequestOptions = {},
): Promise<T | null> => {
	await refreshGiteaToken(giteaId);
	const giteaProvider = await findGiteaById(giteaId);

	if (!giteaProvider?.accessToken) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "No Gitea access token available. Please authorize with Gitea.",
		});
	}

	const response = await fetch(
		`${getGiteaApiBaseUrl(giteaProvider)}/api/v1${path}`,
		{
			method,
			headers: {
				Accept: "application/json",
				Authorization: `token ${giteaProvider.accessToken}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			...(body ? { body: JSON.stringify(body) } : {}),
		},
	);

	if (!response.ok) {
		if (allowedErrorStatuses.includes(response.status)) {
			return null;
		}
		const details = await response.text().catch(() => "");
		throw new Error(
			`Gitea API ${method} ${path} failed: ${response.status} ${response.statusText}${
				details ? ` - ${details.slice(0, 300)}` : ""
			}`,
		);
	}

	if (response.status === 204) {
		return null;
	}

	return (await response.json()) as T;
};

/** Gitea access levels that may trigger a preview deployment. */
export const GITEA_WRITE_PERMISSIONS = ["write", "admin", "owner"];

export interface GiteaRepositoryPermission {
	hasWriteAccess: boolean;
	permission: string | null;
	/**
	 * `false` when Gitea refused to answer, which is a Dokploy-side
	 * misconfiguration rather than a statement about the user.
	 */
	verified: boolean;
}

/**
 * Gitea/Forgejo equivalent of GitHub's collaborator permission check.
 *
 * Possible `permission` values are `none`, `read`, `write`, `admin` and
 * `owner` - the last one is only ever returned by the API, so it has to be
 * allow-listed or repository owners get blocked from their own pull requests.
 * Gitea has no `maintain` level.
 *
 * Note that Gitea only answers this for site admins, repository admins and
 * users asking about themselves; everyone else gets a 403. The Gitea account
 * connected to Dokploy therefore needs admin access on the repository.
 *
 * @link https://docs.gitea.com/api/1.24/#tag/repository/operation/repoGetRepoPermissions
 */
export const checkGiteaUserRepositoryPermissions = async (
	giteaId: string,
	owner: string,
	repository: string,
	username: string,
): Promise<GiteaRepositoryPermission> => {
	try {
		const result = await giteaApiRequest<{ permission?: string }>(
			giteaId,
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
				repository,
			)}/collaborators/${encodeURIComponent(username)}/permission`,
			{ allowedErrorStatuses: [404] },
		);

		if (!result?.permission) {
			// 404: the user is not a collaborator of this repository.
			return { hasWriteAccess: false, permission: null, verified: true };
		}

		return {
			hasWriteAccess: GITEA_WRITE_PERMISSIONS.includes(result.permission),
			permission: result.permission,
			verified: true,
		};
	} catch (error) {
		console.warn(
			`Unable to resolve Gitea permissions for ${username} on ${owner}/${repository}:`,
			error,
		);
		return { hasWriteAccess: false, permission: null, verified: false };
	}
};

/**
 * Create a comment on a Gitea/Forgejo issue or pull request.
 * Pull requests share the issue index, so `index` is the PR number.
 */
export const createGiteaIssueComment = async ({
	giteaId,
	owner,
	repository,
	index,
	body,
}: {
	giteaId: string;
	owner: string;
	repository: string;
	index: string | number;
	body: string;
}) => {
	const comment = await giteaApiRequest<{ id: number }>(
		giteaId,
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
			repository,
		)}/issues/${encodeURIComponent(String(index))}/comments`,
		{ method: "POST", body: { body } },
	);

	if (!comment?.id) {
		throw new Error("Gitea did not return an id for the created comment");
	}

	return comment;
};

export const updateGiteaIssueComment = async ({
	giteaId,
	owner,
	repository,
	commentId,
	body,
}: {
	giteaId: string;
	owner: string;
	repository: string;
	commentId: string | number;
	body: string;
}) => {
	await giteaApiRequest(
		giteaId,
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
			repository,
		)}/issues/comments/${encodeURIComponent(String(commentId))}`,
		{ method: "PATCH", body: { body } },
	);
};

export const giteaIssueCommentExists = async ({
	giteaId,
	owner,
	repository,
	commentId,
}: {
	giteaId: string;
	owner: string;
	repository: string;
	commentId: string | number;
}) => {
	try {
		const comment = await giteaApiRequest<{ id: number }>(
			giteaId,
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
				repository,
			)}/issues/comments/${encodeURIComponent(String(commentId))}`,
			{ allowedErrorStatuses: [404] },
		);
		return !!comment;
	} catch {
		return false;
	}
};

export const listGiteaIssueComments = async ({
	giteaId,
	owner,
	repository,
	index,
}: {
	giteaId: string;
	owner: string;
	repository: string;
	index: string | number;
}) => {
	const comments = await giteaApiRequest<{ body?: string }[]>(
		giteaId,
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
			repository,
		)}/issues/${encodeURIComponent(String(index))}/comments`,
		{ allowedErrorStatuses: [404] },
	);

	return comments ?? [];
};
