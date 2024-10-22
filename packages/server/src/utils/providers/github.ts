import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { paths } from "@/server/constants";
import type { InferResultType } from "@/server/types/with";
import { createAppAuth } from "@octokit/auth-app";
import { TRPCError } from "@trpc/server";
import { Octokit } from "octokit";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";

import type { apiFindGithubBranches } from "@/server/db/schema";
import type { Compose } from "@/server/services/compose";
import { type Github, findGithubById } from "@/server/services/github";
import { execAsyncRemote } from "../process/execAsync";

export const authGithub = (githubProvider: Github): Octokit => {
	if (!haveGithubRequirements(githubProvider)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Account not configured correctly",
		});
	}

	const octokit: Octokit = new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: githubProvider?.githubAppId || 0,
			privateKey: githubProvider?.githubPrivateKey || "",
			installationId: githubProvider?.githubInstallationId,
		},
	});

	return octokit;
};

export const getGithubToken = async (
	octokit: ReturnType<typeof authGithub>,
) => {
	const installation = (await octokit.auth({
		type: "installation",
	})) as {
		token: string;
	};

	return installation.token;
};

export const haveGithubRequirements = (githubProvider: Github) => {
	return !!(
		githubProvider?.githubAppId &&
		githubProvider?.githubPrivateKey &&
		githubProvider?.githubInstallationId
	);
};

const getErrorCloneRequirements = (entity: {
	repository?: string | null;
	owner?: string | null;
	branch?: string | null;
}) => {
	const reasons: string[] = [];
	const { repository, owner, branch } = entity;

	if (!repository) reasons.push("1. Repository not assigned.");
	if (!owner) reasons.push("2. Owner not specified.");
	if (!branch) reasons.push("3. Branch not defined.");

	return reasons;
};

export type ApplicationWithGithub = InferResultType<
	"applications",
	{ github: true }
>;

export type ComposeWithGithub = InferResultType<"compose", { github: true }>;
export const cloneGithubRepository = async (
	entity: ApplicationWithGithub | ComposeWithGithub,
	logPath: string,
	isCompose = false,
) => {
	const { APPLICATIONS_PATH, COMPOSE_PATH } = paths();
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { appName, repository, owner, branch, githubId } = entity;

	if (!githubId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub Provider not found",
		});
	}

	const requirements = getErrorCloneRequirements(entity);

	// Check if requirements are met
	if (requirements.length > 0) {
		writeStream.write(
			`\nGitHub Repository configuration failed for application: ${appName}\n`,
		);
		writeStream.write("Reasons:\n");
		writeStream.write(requirements.join("\n"));
		writeStream.end();
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error: GitHub repository information is incomplete.",
		});
	}

	const githubProvider = await findGithubById(githubId);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	const octokit = authGithub(githubProvider);
	const token = await getGithubToken(octokit);
	const repoclone = `github.com/${owner}/${repository}.git`;
	await recreateDirectory(outputPath);
	const cloneUrl = `https://oauth2:${token}@${repoclone}`;

	try {
		writeStream.write(`\nClonning Repo ${repoclone} to ${outputPath}: ✅\n`);
		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				branch!,
				"--depth",
				"1",
				"--recurse-submodules",
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

export const getGithubCloneCommand = async (
	entity: ApplicationWithGithub | ComposeWithGithub,
	logPath: string,
	isCompose = false,
) => {
	const { appName, repository, owner, branch, githubId, serverId } = entity;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	if (!githubId) {
		const command = `
			echo  "Error: ❌ Github Provider not found" >> ${logPath};
			exit 1;
		`;

		await execAsyncRemote(serverId, command);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub Provider not found",
		});
	}

	const requirements = getErrorCloneRequirements(entity);

	// Build log messages
	let logMessages = "";
	if (requirements.length > 0) {
		logMessages += `\nGitHub Repository configuration failed for application: ${appName}\n`;
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
	const githubProvider = await findGithubById(githubId);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	const octokit = authGithub(githubProvider);
	const token = await getGithubToken(octokit);
	const repoclone = `github.com/${owner}/${repository}.git`;
	const cloneUrl = `https://oauth2:${token}@${repoclone}`;

	const cloneCommand = `
rm -rf ${outputPath};
mkdir -p ${outputPath};
if ! git clone --branch ${branch} --depth 1 --recurse-submodules --progress ${cloneUrl} ${outputPath} >> ${logPath} 2>&1; then
	echo "❌ [ERROR] Fallo al clonar el repositorio ${repoclone}" >> ${logPath};
	exit 1;
fi
echo "Cloned ${repoclone} to ${outputPath}: ✅" >> ${logPath};
	`;

	return cloneCommand;
};

export const cloneRawGithubRepository = async (entity: Compose) => {
	const { appName, repository, owner, branch, githubId } = entity;

	if (!githubId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub Provider not found",
		});
	}
	const { COMPOSE_PATH } = paths();
	const githubProvider = await findGithubById(githubId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const octokit = authGithub(githubProvider);
	const token = await getGithubToken(octokit);
	const repoclone = `github.com/${owner}/${repository}.git`;
	await recreateDirectory(outputPath);
	const cloneUrl = `https://oauth2:${token}@${repoclone}`;
	try {
		await spawnAsync("git", [
			"clone",
			"--branch",
			branch!,
			"--depth",
			"1",
			"--recurse-submodules",
			cloneUrl,
			outputPath,
			"--progress",
		]);
	} catch (error) {
		throw error;
	}
};

export const cloneRawGithubRepositoryRemote = async (compose: Compose) => {
	const { appName, repository, owner, branch, githubId, serverId } = compose;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	if (!githubId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub Provider not found",
		});
	}

	const { COMPOSE_PATH } = paths(true);
	const githubProvider = await findGithubById(githubId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const octokit = authGithub(githubProvider);
	const token = await getGithubToken(octokit);
	const repoclone = `github.com/${owner}/${repository}.git`;
	const cloneUrl = `https://oauth2:${token}@${repoclone}`;
	try {
		const command = `
			rm -rf ${outputPath};
			git clone --branch ${branch} --depth 1 ${cloneUrl} ${outputPath}
		`;
		await execAsyncRemote(serverId, command);
	} catch (error) {
		throw error;
	}
};

export const getGithubRepositories = async (githubId?: string) => {
	if (!githubId) {
		return [];
	}

	const githubProvider = await findGithubById(githubId);

	const octokit = new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: githubProvider.githubAppId,
			privateKey: githubProvider.githubPrivateKey,
			installationId: githubProvider.githubInstallationId,
		},
	});

	const repositories = (await octokit.paginate(
		octokit.rest.apps.listReposAccessibleToInstallation,
	)) as unknown as Awaited<
		ReturnType<typeof octokit.rest.apps.listReposAccessibleToInstallation>
	>["data"]["repositories"];

	return repositories;
};

export const getGithubBranches = async (
	input: typeof apiFindGithubBranches._type,
) => {
	if (!input.githubId) {
		return [];
	}
	const githubProvider = await findGithubById(input.githubId);

	const octokit = new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: githubProvider.githubAppId,
			privateKey: githubProvider.githubPrivateKey,
			installationId: githubProvider.githubInstallationId,
		},
	});

	const branches = (await octokit.paginate(octokit.rest.repos.listBranches, {
		owner: input.owner,
		repo: input.repo,
	})) as unknown as Awaited<
		ReturnType<typeof octokit.rest.repos.listBranches>
	>["data"];

	return branches;
};
