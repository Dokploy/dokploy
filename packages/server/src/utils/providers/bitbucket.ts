import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { paths } from "@/server/constants";
import type {
	apiBitbucketTestConnection,
	apiFindBitbucketBranches,
} from "@/server/db/schema";
import { findBitbucketById } from "@/server/services/bitbucket";
import type { Compose } from "@/server/services/compose";
import type { InferResultType } from "@/server/types/with";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export type ApplicationWithBitbucket = InferResultType<
	"applications",
	{ bitbucket: true }
>;

export type ComposeWithBitbucket = InferResultType<
	"compose",
	{ bitbucket: true }
>;

export const cloneBitbucketRepository = async (
	entity: ApplicationWithBitbucket | ComposeWithBitbucket,
	logPath: string,
	isCompose = false,
) => {
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths();
	const writeStream = createWriteStream(logPath, { flags: "a" });
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketId,
		bitbucket,
	} = entity;

	if (!bitbucketId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `bitbucket.org/${bitbucketOwner}/${bitbucketRepository}.git`;
	const cloneUrl = `https://${bitbucket?.bitbucketUsername}:${bitbucket?.appPassword}@${repoclone}`;
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
		writeStream.write(`\nCloned ${repoclone} to ${outputPath}: ✅\n`);
	} catch (error) {
		writeStream.write(`ERROR Clonning: ${error}: ❌`);
		throw error;
	} finally {
		writeStream.end();
	}
};

export const cloneRawBitbucketRepository = async (entity: Compose) => {
	const { COMPOSE_PATH } = paths();
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketId,
	} = entity;

	if (!bitbucketId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const bitbucketProvider = await findBitbucketById(bitbucketId);
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
			"--recurse-submodules",
			cloneUrl,
			outputPath,
			"--progress",
		]);
	} catch (error) {
		throw error;
	}
};

export const cloneRawBitbucketRepositoryRemote = async (compose: Compose) => {
	const { COMPOSE_PATH } = paths(true);
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketId,
		serverId,
	} = compose;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}
	if (!bitbucketId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const bitbucketProvider = await findBitbucketById(bitbucketId);
	const basePath = COMPOSE_PATH;
	const outputPath = join(basePath, appName, "code");
	const repoclone = `bitbucket.org/${bitbucketOwner}/${bitbucketRepository}.git`;
	const cloneUrl = `https://${bitbucketProvider?.bitbucketUsername}:${bitbucketProvider?.appPassword}@${repoclone}`;

	try {
		const command = `
			rm -rf ${outputPath};
			git clone --branch ${bitbucketBranch} --depth 1 --recurse-submodules ${cloneUrl} ${outputPath}
		`;
		await execAsyncRemote(serverId, command);
	} catch (error) {
		throw error;
	}
};

export const getBitbucketCloneCommand = async (
	entity: ApplicationWithBitbucket | ComposeWithBitbucket,
	logPath: string,
	isCompose = false,
) => {
	const { COMPOSE_PATH, APPLICATIONS_PATH } = paths(true);
	const {
		appName,
		bitbucketRepository,
		bitbucketOwner,
		bitbucketBranch,
		bitbucketId,
		serverId,
		bitbucket,
	} = entity;

	if (!serverId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Server not found",
		});
	}

	if (!bitbucketId) {
		const command = `
			echo  "Error: ❌ Bitbucket Provider not found" >> ${logPath};
			exit 1;
		`;
		await execAsyncRemote(serverId, command);
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	const bitbucketProvider = await findBitbucketById(bitbucketId);
	const basePath = isCompose ? COMPOSE_PATH : APPLICATIONS_PATH;
	const outputPath = join(basePath, appName, "code");
	await recreateDirectory(outputPath);
	const repoclone = `bitbucket.org/${bitbucketOwner}/${bitbucketRepository}.git`;
	const cloneUrl = `https://${bitbucketProvider?.bitbucketUsername}:${bitbucketProvider?.appPassword}@${repoclone}`;

	const cloneCommand = `
rm -rf ${outputPath};
mkdir -p ${outputPath};
if ! git clone --branch ${bitbucketBranch} --depth 1 --recurse-submodules --progress ${cloneUrl} ${outputPath} >> ${logPath} 2>&1; then
	echo "❌ [ERROR] Fail to clone the repository ${repoclone}" >> ${logPath};
	exit 1;
fi
echo "Cloned ${repoclone} to ${outputPath}: ✅" >> ${logPath};
	`;

	return cloneCommand;
};

export const getBitbucketRepositories = async (bitbucketId?: string) => {
	if (!bitbucketId) {
		return [];
	}
	const bitbucketProvider = await findBitbucketById(bitbucketId);

	const username =
		bitbucketProvider.bitbucketWorkspaceName ||
		bitbucketProvider.bitbucketUsername;
	const url = `https://api.bitbucket.org/2.0/repositories/${username}?pagelen=100`;

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

		const mappedData = data.values.map((repo: any) => {
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

export const getBitbucketBranches = async (
	input: typeof apiFindBitbucketBranches._type,
) => {
	if (!input.bitbucketId) {
		return [];
	}
	const bitbucketProvider = await findBitbucketById(input.bitbucketId);
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

		const mappedData = data.values.map((branch: any) => {
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

export const testBitbucketConnection = async (
	input: typeof apiBitbucketTestConnection._type,
) => {
	const bitbucketProvider = await findBitbucketById(input.bitbucketId);

	if (!bitbucketProvider) {
		throw new Error("Bitbucket provider not found");
	}

	const { bitbucketUsername, workspaceName } = input;

	const username = workspaceName || bitbucketUsername;

	const url = `https://api.bitbucket.org/2.0/repositories/${username}`;
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

		const mappedData = data.values.map((repo: any) => {
			return {
				name: repo.name,
				url: repo.links.html.href,
				owner: {
					username: repo.workspace.slug,
				},
			};
		}) as [];

		return mappedData.length;
	} catch (error) {
		throw error;
	}
};
