import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { APPLICATIONS_PATH, COMPOSE_PATH } from "@/server/constants";
import { createAppAuth } from "@octokit/auth-app";
import { TRPCError } from "@trpc/server";
import { Octokit } from "octokit";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { InferResultType } from "@/server/types/with";
import {
	getGithubProvider,
	type GithubProvider,
} from "@/server/api/services/git-provider";
import type { Compose } from "@/server/api/services/compose";

export const authGithub = (githubProvider: GithubProvider) => {
	if (!haveGithubRequirements(githubProvider)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Account not configured correctly",
		});
	}

	const octokit = new Octokit({
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

export const haveGithubRequirements = (githubProvider: GithubProvider) => {
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
	{ githubProvider: true }
>;

export type ComposeWithGithub = InferResultType<
	"compose",
	{ githubProvider: true }
>;
export const cloneGithubRepository = async (
	entity: ApplicationWithGithub | ComposeWithGithub,
	logPath: string,
	isCompose = false,
) => {
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

	const githubProvider = await getGithubProvider(githubId);
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

export const cloneRawGithubRepository = async (entity: Compose) => {
	const { appName, repository, owner, branch, githubId } = entity;

	if (!githubId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "GitHub Provider not found",
		});
	}
	const githubProvider = await getGithubProvider(githubId);
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
			cloneUrl,
			outputPath,
			"--progress",
		]);
	} catch (error) {
		throw error;
	}
};

interface GetGithubRepositories {
	githubId?: string;
}

export const getGithubRepositories = async (input: GetGithubRepositories) => {
	if (!input.githubId) {
		return [];
	}

	const githubProvider = await getGithubProvider(input.githubId);

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

interface GetGithubBranches {
	owner: string;
	repo: string;
	githubId?: string;
}

export const getGithubBranches = async (input: GetGithubBranches) => {
	if (!input.githubId) {
		return [];
	}
	const githubProvider = await getGithubProvider(input.githubId);

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
