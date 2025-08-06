import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Compose } from "@dokploy/server/services/compose";
import {
	findGiteaById,
	type Gitea,
	updateGitea,
} from "@dokploy/server/services/gitea";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

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
		const tokenEndpoint = `${giteaProvider.giteaUrl}/login/oauth/access_token`;
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

export type ApplicationWithGitea = InferResultType<
	"applications",
	{ gitea: true }
>;

export type ComposeWithGitea = InferResultType<"compose", { gitea: true }>;

export const getGiteaCloneCommand = async (
	entity: ApplicationWithGitea | ComposeWithGitea,
	logPath: string,
	isCompose = false,
) => {
	const {
		appName,
		giteaBranch,
		giteaId,
		giteaOwner,
		giteaRepository,
		serverId,
		enableSubmodules,
	} = entity;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	if (!giteaId) {
		const command = `
		echo  "Error: ❌ Gitlab Provider not found" >> ${logPath};
		exit 1;
	`;

		await execAsyncRemote(serverId, command);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea Provider not found",
		});
	}

	// Use paths(true) for remote operations
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(true);
	await refreshGiteaToken(giteaId);
	const gitea = await findGiteaById(giteaId);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");

	const baseUrl = gitea?.giteaUrl.replace(/^https?:\/\//, "");
	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const cloneUrl = `https://oauth2:${gitea?.accessToken}@${baseUrl}/${repoClone}`;

	const cloneCommand = `
    rm -rf ${outputPath};
    mkdir -p ${outputPath};

    if ! git clone --branch ${giteaBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${cloneUrl} ${outputPath} >> ${logPath} 2>&1; then
      echo "❌ [ERROR] Failed to clone the repository ${repoClone}" >> ${logPath};
      exit 1;
    fi

    echo "Cloned ${repoClone} to ${outputPath}: ✅" >> ${logPath};
  `;

	return cloneCommand;
};

export const cloneGiteaRepository = async (
	entity: ApplicationWithGitea | ComposeWithGitea,
	logPath: string,
	isCompose = false,
) => {
	const { APPLICATIONS_PATH, COMPOSE_PATH } = paths();

	const writeStream = createWriteStream(logPath, { flags: "a" });
	const {
		appName,
		giteaBranch,
		giteaId,
		giteaOwner,
		giteaRepository,
		enableSubmodules,
	} = entity;

	if (!giteaId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea Provider not found",
		});
	}

	await refreshGiteaToken(giteaId);
	const giteaProvider = await findGiteaById(giteaId);
	if (!giteaProvider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea provider not found in the database",
		});
	}

	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);

	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const baseUrl = giteaProvider.giteaUrl.replace(/^https?:\/\//, "");
	const cloneUrl = `https://oauth2:${giteaProvider.accessToken}@${baseUrl}/${repoClone}`;

	writeStream.write(`\nCloning Repo ${repoClone} to ${outputPath}...\n`);

	try {
		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				giteaBranch!,
				"--depth",
				"1",
				...(enableSubmodules ? ["--recurse-submodules"] : []),
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
		writeStream.write(`\nCloned ${repoClone}: ✅\n`);
	} catch (error) {
		writeStream.write(`ERROR Cloning: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const cloneRawGiteaRepository = async (entity: Compose) => {
	const {
		appName,
		giteaRepository,
		giteaOwner,
		giteaBranch,
		giteaId,
		enableSubmodules,
	} = entity;
	const { COMPOSE_PATH } = paths();

	if (!giteaId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea Provider not found",
		});
	}
	await refreshGiteaToken(giteaId);
	const giteaProvider = await findGiteaById(giteaId);
	if (!giteaProvider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea provider not found in the database",
		});
	}

	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);

	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const baseUrl = giteaProvider.giteaUrl.replace(/^https?:\/\//, "");
	const cloneUrl = `https://oauth2:${giteaProvider.accessToken}@${baseUrl}/${repoClone}`;

	try {
		await spawnAsync("git", [
			"clone",
			"--branch",
			giteaBranch!,
			"--depth",
			"1",
			...(enableSubmodules ? ["--recurse-submodules"] : []),
			cloneUrl,
			outputPath,
			"--progress",
		]);
	} catch (error) {
		throw error;
	}
};

export const cloneRawGiteaRepositoryRemote = async (compose: Compose) => {
	const {
		appName,
		giteaRepository,
		giteaOwner,
		giteaBranch,
		giteaId,
		serverId,
		enableSubmodules,
	} = compose;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	if (!giteaId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitea Provider not found",
		});
	}
	const { COMPOSE_PATH } = paths(true);
	const giteaProvider = await findGiteaById(giteaId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const repoClone = `${giteaOwner}/${giteaRepository}.git`;
	const baseUrl = giteaProvider.giteaUrl.replace(/^https?:\/\//, "");
	const cloneUrl = `https://oauth2:${giteaProvider.accessToken}@${baseUrl}/${repoClone}`;
	try {
		const command = `
			rm -rf ${outputPath};
			git clone --branch ${giteaBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${cloneUrl} ${outputPath}
		`;
		await execAsyncRemote(serverId, command);
	} catch (error) {
		throw error;
	}
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
		const limit = 30;
		let allRepos = 0;
		let nextUrl = `${baseUrl}/api/v1/repos/search?limit=${limit}`;

		while (nextUrl) {
			const response = await fetch(nextUrl, {
				headers: {
					Accept: "application/json",
					Authorization: `token ${provider.accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(
					`Failed to connect to Gitea API: ${response.status} ${response.statusText}`,
				);
			}

			const repos = await response.json();
			allRepos += repos.data.length;

			const linkHeader = response.headers.get("link");
			nextUrl = "";

			if (linkHeader) {
				const nextLink = linkHeader
					.split(",")
					.find((link) => link.includes('rel="next"'));
				if (nextLink) {
					const matches = nextLink.match(/<([^>]+)>/);
					if (matches?.[1]) {
						nextUrl = matches[1];
					}
				}
			}
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
	const limit = 30;
	let allRepositories: any[] = [];
	let nextUrl = `${baseUrl}/api/v1/repos/search?limit=${limit}`;

	while (nextUrl) {
		const response = await fetch(nextUrl, {
			headers: {
				Accept: "application/json",
				Authorization: `token ${giteaProvider.accessToken}`,
			},
		});

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Failed to fetch repositories: ${response.statusText}`,
			});
		}

		const result = await response.json();
		allRepositories = [...allRepositories, ...result.data];

		const linkHeader = response.headers.get("link");
		nextUrl = "";

		if (linkHeader) {
			const nextLink = linkHeader
				.split(",")
				.find((link) => link.includes('rel="next"'));
			if (nextLink) {
				const matches = nextLink.match(/<([^>]+)>/);
				if (matches?.[1]) {
					nextUrl = matches[1];
				}
			}
		}
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
	const url = `${baseUrl}/api/v1/repos/${input.owner}/${input.repo}/branches`;

	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `token ${giteaProvider.accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch branches: ${response.statusText}`);
	}

	const branches = await response.json();

	if (!branches) {
		return [];
	}
	return branches?.map((branch: any) => ({
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
