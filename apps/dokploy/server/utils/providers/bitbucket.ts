import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { APPLICATIONS_PATH, COMPOSE_PATH } from "@/server/constants";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { InferResultType } from "@/server/types/with";
import { getBitbucketProvider } from "@/server/api/services/git-provider";

export type ApplicationWithBitbucket = InferResultType<
	"applications",
	{ bitbucketProvider: true }
>;

export const cloneBitbucketRepository = async (
	entity: ApplicationWithBitbucket,
	logPath: string,
	isCompose = false,
) => {
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketProviderId,
		bitbucketProvider,
	} = entity;

	if (!bitbucketProviderId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `bitbucket.org/${bitbucketOwner}/${bitbucketRepository}.git`;
	const cloneUrl = `https://${bitbucketProvider?.bitbucketUsername}:${bitbucketProvider?.appPassword}@${repoclone}`;

	try {
		writeStream.write(`\nCloning Repo ${repoclone} to ${outputPath}: ✅\n`);
		await spawnAsync(
			"git",
			[
				"clone",
				"--branch",
				bitbucketBranch!,
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
		writeStream.write(`\nCloned ${repoclone} to ${outputPath}: ✅\n`);
	} catch (error) {
		writeStream.write(`ERROR Clonning: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const cloneRawBitbucketRepository = async (
	entity: ApplicationWithBitbucket,
) => {
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketProviderId,
		bitbucketProvider,
	} = entity;

	if (!bitbucketProviderId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `bitbucket.org/${bitbucketOwner}/${bitbucketRepository}.git`;
	const cloneUrl = `https://${bitbucketProvider?.bitbucketUsername}:${bitbucketProvider?.appPassword}@${repoclone}`;

	try {
		await spawnAsync("git", [
			"clone",
			"--branch",
			bitbucketBranch!,
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

interface GetBitbucketRepositories {
	bitbucketProviderId?: string;
}

export const getBitbucketRepositories = async (
	input: GetBitbucketRepositories,
) => {
	if (!input.bitbucketProviderId) {
		return [];
	}
	const bitbucketProvider = await getBitbucketProvider(
		input.bitbucketProviderId,
	);

	const url = `https://api.bitbucket.org/2.0/repositories/${bitbucketProvider.bitbucketUsername}`;

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Basic ${Buffer.from(`${bitbucketProvider.bitbucketUsername}:${bitbucketProvider.appPassword}`).toString("base64")}`,
			},
		});

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Failed to fetch repositories: ${response.statusText}`,
			});
		}

		const data = await response.json();

		const mappedData = data.values.map((repo) => {
			return {
				name: repo.name,
				url: repo.links.html.href,
				owner: {
					username: repo.workspace.slug,
				},
			};
		});

		return mappedData as {
			name: string;
			url: string;
			owner: {
				username: string;
			};
		}[];
	} catch (error) {
		throw error;
	}
};

interface GetBitbucketBranches {
	owner: string;
	repo: string;
	bitbucketProviderId?: string;
}

export const getBitbucketBranches = async (input: GetBitbucketBranches) => {
	if (!input.bitbucketProviderId) {
		return [];
	}
	const bitbucketProvider = await getBitbucketProvider(
		input.bitbucketProviderId,
	);
	const { owner, repo } = input;
	const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/branches`;

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Basic ${Buffer.from(`${bitbucketProvider.bitbucketUsername}:${bitbucketProvider.appPassword}`).toString("base64")}`,
			},
		});

		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `HTTP error! status: ${response.status}`,
			});
		}

		const data = await response.json();

		const mappedData = data.values.map((branch) => {
			return {
				name: branch.name,
				commit: {
					sha: branch.target.hash,
				},
			};
		});

		return mappedData as {
			name: string;
			commit: {
				sha: string;
			};
		}[];
	} catch (error) {
		throw error;
	}
};
