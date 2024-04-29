import { createWriteStream } from "node:fs";
import path from "node:path";
import type { Application } from "@/server/api/services/application";
import { APPLICATIONS_PATH } from "@/server/constants";
import { createAppAuth } from "@octokit/auth-app";
import { TRPCError } from "@trpc/server";
import { Octokit } from "octokit";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { Admin } from "@/server/api/services/admin";

export const authGithub = (admin: Admin) => {
	if (!haveGithubRequirements(admin)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Account not configured correctly",
		});
	}

	const octokit = new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: admin?.githubAppId || 0,
			privateKey: admin?.githubPrivateKey || "",
			installationId: admin?.githubInstallationId,
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

export const haveGithubRequirements = (admin: Admin) => {
	return !!(
		admin?.githubAppId &&
		admin?.githubPrivateKey &&
		admin?.githubInstallationId
	);
};

const getErrorCloneRequirements = (application: Application) => {
	const reasons: string[] = [];
	const { repository, owner, branch } = application;

	if (!repository) reasons.push("1. Repository not assigned.");
	if (!owner) reasons.push("2. Owner not specified .");
	if (!branch) reasons.push("3. Branch not defined.");

	return reasons;
};
export const cloneGithubRepository = async (
	admin: Admin,
	application: Application,
	logPath: string,
) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const { appName, repository, owner, branch } = application;

	const requirements = getErrorCloneRequirements(application);

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
	const outputPath = path.join(APPLICATIONS_PATH, appName);
	const octokit = authGithub(admin);
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
