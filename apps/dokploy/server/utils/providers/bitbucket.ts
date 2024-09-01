import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { APPLICATIONS_PATH, COMPOSE_PATH } from "@/server/constants";
import { TRPCError } from "@trpc/server";
import { recreateDirectory } from "../filesystem/directory";
import { spawnAsync } from "../process/spawnAsync";
import type { InferResultType } from "@/server/types/with";

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
