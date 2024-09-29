import { db } from "@/server/db";
import {
	type apiCreateBitbucket,
	type apiUpdateBitbucket,
	bitbucket,
	gitProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Bitbucket = typeof bitbucket.$inferSelect;

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

export const findBitbucketById = async (bitbucketId: string) => {
	const bitbucketProviderResult = await db.query.bitbucket.findFirst({
		where: eq(bitbucket.bitbucketId, bitbucketId),
		with: {
			gitProvider: true,
		},
	});

	if (!bitbucketProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Bitbucket Provider not found",
		});
	}

	return bitbucketProviderResult;
};

export const updateBitbucket = async (
	bitbucketId: string,
	input: typeof apiUpdateBitbucket._type,
) => {
	return await db.transaction(async (tx) => {
		const result = await tx
			.update(bitbucket)
			.set({
				...input,
			})
			.where(eq(bitbucket.bitbucketId, bitbucketId))
			.returning();

		if (input.name) {
			await tx
				.update(gitProvider)
				.set({
					name: input.name,
				})
				.where(eq(gitProvider.gitProviderId, input.gitProviderId))
				.returning();
		}

		return result[0];
	});
};
