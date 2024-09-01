import { db } from "@/server/db";
import {
	type apiCreateBitbucketProvider,
	type apiCreateGithubProvider,
	type apiCreateGitlabProvider,
	bitbucketProvider,
	githubProvider,
	gitlabProvider,
	gitProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type GithubProvider = typeof githubProvider.$inferSelect;

export type GitlabProvider = typeof gitlabProvider.$inferSelect;
export const createGithubProvider = async (
	input: typeof apiCreateGithubProvider._type,
) => {
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
			.insert(githubProvider)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const createGitlabProvider = async (
	input: typeof apiCreateGitlabProvider._type,
) => {
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
			.insert(gitlabProvider)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const createBitbucketProvider = async (
	input: typeof apiCreateBitbucketProvider._type,
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
			.insert(bitbucketProvider)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const removeGithubProvider = async (gitProviderId: string) => {
	const result = await db
		.delete(gitProvider)
		.where(eq(gitProvider.gitProviderId, gitProviderId))
		.returning();

	return result[0];
};

export const getGithubProvider = async (githubProviderId: string) => {
	const githubProviderResult = await db.query.githubProvider.findFirst({
		where: eq(githubProvider.githubProviderId, githubProviderId),
	});

	if (!githubProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Provider not found",
		});
	}

	return githubProviderResult;
};

export const haveGithubRequirements = (githubProvider: GithubProvider) => {
	return !!(
		githubProvider?.githubAppId &&
		githubProvider?.githubPrivateKey &&
		githubProvider?.githubInstallationId
	);
};

export const haveGitlabRequirements = (gitlabProvider: GitlabProvider) => {
	return !!(gitlabProvider?.accessToken && gitlabProvider?.refreshToken);
};

export const getGitlabProvider = async (gitlabProviderId: string) => {
	const gitlabProviderResult = await db.query.gitlabProvider.findFirst({
		where: eq(gitlabProvider.gitlabProviderId, gitlabProviderId),
	});

	if (!gitlabProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	return gitlabProviderResult;
};

export const updateGitlabProvider = async (
	gitlabProviderId: string,
	input: Partial<GitlabProvider>,
) => {
	const result = await db
		.update(gitlabProvider)
		.set({
			...input,
		})
		.where(eq(gitlabProvider.gitlabProviderId, gitlabProviderId))
		.returning();

	return result[0];
};

export const getBitbucketProvider = async (bitbucketProviderId: string) => {
	const bitbucketProviderResult = await db.query.bitbucketProvider.findFirst({
		where: eq(bitbucketProvider.bitbucketProviderId, bitbucketProviderId),
	});

	if (!bitbucketProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	return bitbucketProviderResult;
};
