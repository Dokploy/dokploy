import { db } from "@/server/db";
import {
	type apiCreateBitbucket,
	type apiCreateGithub,
	type apiCreateGitlab,
	bitbucket,
	github,
	gitlab,
	gitProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Github = typeof github.$inferSelect;

export type Gitlab = typeof gitlab.$inferSelect;
export const createGithub = async (input: typeof apiCreateGithub._type) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "github",
				authId: input.authId,
				name: input.name,
			})
			.returning()
			.then((response) => response[0]);

		if (!newGitProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the git provider",
			});
		}

		return await tx
			.insert(github)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const createGitlab = async (input: typeof apiCreateGitlab._type) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "gitlab",
				authId: input.authId,
				name: input.name,
			})
			.returning()
			.then((response) => response[0]);

		if (!newGitProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the git provider",
			});
		}

		await tx
			.insert(gitlab)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const createBitbucket = async (
	input: typeof apiCreateBitbucket._type,
) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "bitbucket",
				authId: input.authId,
				name: input.name,
			})
			.returning()
			.then((response) => response[0]);

		if (!newGitProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the git provider",
			});
		}

		await tx
			.insert(bitbucket)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const removeGithub = async (gitProviderId: string) => {
	const result = await db
		.delete(gitProvider)
		.where(eq(gitProvider.gitProviderId, gitProviderId))
		.returning();

	return result[0];
};

export const findGithubById = async (githubId: string) => {
	const githubProviderResult = await db.query.github.findFirst({
		where: eq(github.githubId, githubId),
	});

	if (!githubProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Provider not found",
		});
	}

	return githubProviderResult;
};

export const haveGithubRequirements = (github: Github) => {
	return !!(
		github?.githubAppId &&
		github?.githubPrivateKey &&
		github?.githubInstallationId
	);
};

export const findGitlabById = async (gitlabId: string) => {
	const gitlabProviderResult = await db.query.gitlab.findFirst({
		where: eq(gitlab.gitlabId, gitlabId),
	});

	if (!gitlabProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	return gitlabProviderResult;
};

export const updateGitlab = async (
	gitlabId: string,
	input: Partial<Gitlab>,
) => {
	const result = await db
		.update(gitlab)
		.set({
			...input,
		})
		.where(eq(gitlab.gitlabId, gitlabId))
		.returning();

	return result[0];
};

export const findBitbucketById = async (bitbucketId: string) => {
	const bitbucketProviderResult = await db.query.bitbucket.findFirst({
		where: eq(bitbucket.bitbucketId, bitbucketId),
	});

	if (!bitbucketProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	return bitbucketProviderResult;
};
