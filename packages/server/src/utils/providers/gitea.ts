import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	findGiteaById,
	type Gitea,
	updateGitea,
} from "@dokploy/server/services/gitea";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";

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

	const basePath = type === "compose" ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = outputPathOverride ?? join(basePath, appName, "code");
	command += `rm -rf ${outputPath};`;
	command += `mkdir -p ${outputPath};`;

	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const cloneUrl = buildGiteaCloneUrl(
		giteaProvider.giteaUrl,
		giteaProvider.accessToken!,
		giteaOwner!,
		giteaRepository!,
	);

	command += `echo "Cloning Repo ${repoClone} to ${outputPath}: ✅";`;
	command += `git clone --branch ${giteaBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${cloneUrl} ${outputPath} --progress;`;
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

		const baseUrl = provider.giteaUrl.replace(/\/+$/, "");

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

	const baseUrl = giteaProvider.giteaUrl.replace(/\/+$/, "");

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

	const baseUrl = giteaProvider.giteaUrl.replace(/\/+$/, "");

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
