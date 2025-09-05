import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { apiGitlabTestConnection } from "@dokploy/server/db/schema";
import type { Compose } from "@dokploy/server/services/compose";
import {
	findGitlabById,
	type Gitlab,
	updateGitlab,
} from "@dokploy/server/services/gitlab";
import type { InferResultType } from "@dokploy/server/types/with";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";
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

	const response = await fetch(`${gitlabProvider.gitlabUrl}/oauth/token`, {
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
	const repoClone = `${gitlab?.gitlabUrl.replace(/^https?:\/\//, "")}/${gitlabPathNamespace}.git`;
	return repoClone;
};

const getGitlabCloneUrl = (gitlab: GitlabInfo, repoClone: string) => {
	const isSecure = gitlab?.gitlabUrl.startsWith("https://");
	const cloneUrl = `http${isSecure ? "s" : ""}://oauth2:${gitlab?.accessToken}@${repoClone}`;
	return cloneUrl;
};

export const cloneGitlabRepository = async (
	entity: ApplicationWithGitlab | ComposeWithGitlab,
	logPath: string,
	isCompose = false,
) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const {
		appName,
		gitlabBranch,
		gitlabId,
		gitlabPathNamespace,
		enableSubmodules,
	} = entity;

	if (!gitlabId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	await refreshGitlabToken(gitlabId);
	const gitlab = await findGitlabById(gitlabId);

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

	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths();
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoClone = getGitlabRepoClone(gitlab, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlab, repoClone);
	try {
		writeStream.write(`\nCloning Repo ${repoClone} to ${outputPath}: ✅\n`);
		const cloneArgs = [
			"clone",
			"--branch",
			gitlabBranch!,
			"--depth",
			"1",
			...(enableSubmodules ? ["--recurse-submodules"] : []),
			cloneUrl,
			outputPath,
			"--progress",
		];

		await spawnAsync("git", cloneArgs, (data) => {
			if (writeStream.writable) {
				writeStream.write(data);
			}
		});
		writeStream.write(`\nCloned ${repoClone}: ✅\n`);
	} catch (error) {
		writeStream.write(`ERROR Cloning: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const getGitlabCloneCommand = async (
	entity: ApplicationWithGitlab | ComposeWithGitlab,
	logPath: string,
	isCompose = false,
) => {
	const {
		appName,
		gitlabPathNamespace,
		gitlabBranch,
		gitlabId,
		serverId,
		enableSubmodules,
	} = entity;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	if (!gitlabId) {
		const command = `
			echo  "Error: ❌ Gitlab Provider not found" >> ${logPath};
			exit 1;
		`;

		await execAsyncRemote(serverId, command);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	const requirements = getErrorCloneRequirements(entity);

	// Build log messages
	let logMessages = "";
	if (requirements.length > 0) {
		logMessages += `\nGitLab Repository configuration failed for application: ${appName}\n`;
		logMessages += "Reasons:\n";
		logMessages += requirements.join("\n");
		const escapedLogMessages = logMessages
			.replace(/\\/g, "\\\\")
			.replace(/"/g, '\\"')
			.replace(/\n/g, "\\n");

		const bashCommand = `
            echo "${escapedLogMessages}" >> ${logPath};
            exit 1;  # Exit with error code
        `;

		await execAsyncRemote(serverId, bashCommand);
		return;
	}

	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(true);
	await refreshGitlabToken(gitlabId);
	const gitlab = await findGitlabById(gitlabId);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoClone = getGitlabRepoClone(gitlab, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlab, repoClone);
	const cloneCommand = `
rm -rf ${outputPath};
mkdir -p ${outputPath};
if ! git clone --branch ${gitlabBranch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} --progress ${cloneUrl} ${outputPath} >> ${logPath} 2>&1; then
	echo "❌ [ERROR] Fail to clone the repository ${repoClone}" >> ${logPath};
	exit 1;
fi
echo "Cloned ${repoClone} to ${outputPath}: ✅" >> ${logPath};
	`;

	return cloneCommand;
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
				.some((name) =>
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

	while (true) {
		const branchesResponse = await fetch(
			`${gitlabProvider.gitlabUrl}/api/v4/projects/${input.id}/repository/branches?page=${page}&per_page=${perPage}`,
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

export const cloneRawGitlabRepository = async (entity: Compose) => {
	const {
		appName,
		gitlabBranch,
		gitlabId,
		gitlabPathNamespace,
		enableSubmodules,
	} = entity;

	if (!gitlabId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	const { COMPOSE_PATH } = paths();
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoClone = getGitlabRepoClone(gitlabProvider, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlabProvider, repoClone);
	try {
		const cloneArgs = [
			"clone",
			"--branch",
			gitlabBranch!,
			"--depth",
			"1",
			...(enableSubmodules ? ["--recurse-submodules"] : []),
			cloneUrl,
			outputPath,
			"--progress",
		];
		await spawnAsync("git", cloneArgs);
	} catch (error) {
		throw error;
	}
};

export const cloneRawGitlabRepositoryRemote = async (compose: Compose) => {
	const {
		appName,
		gitlabPathNamespace,
		branch,
		gitlabId,
		serverId,
		enableSubmodules,
	} = compose;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	if (!gitlabId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}
	const { COMPOSE_PATH } = paths(true);
	await refreshGitlabToken(gitlabId);
	const gitlabProvider = await findGitlabById(gitlabId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const repoClone = getGitlabRepoClone(gitlabProvider, gitlabPathNamespace);
	const cloneUrl = getGitlabCloneUrl(gitlabProvider, repoClone);
	try {
		const command = `
			rm -rf ${outputPath};
			git clone --branch ${branch} --depth 1 ${enableSubmodules ? "--recurse-submodules" : ""} ${cloneUrl} ${outputPath}
		`;
		await execAsyncRemote(serverId, command);
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

	const repositories = await validateGitlabProvider(gitlabProvider);

	const filteredRepos = repositories.filter((repo: any) => {
		const { full_path, kind } = repo.namespace;

		if (groupName) {
			return groupName
				.split(",")
				.some((name) =>
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

		while (true) {
			const response = await fetch(
				`${gitlabProvider.gitlabUrl}/api/v4/projects?membership=true&owned=true&page=${page}&per_page=${perPage}`,
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
