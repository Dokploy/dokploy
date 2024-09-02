import { db } from "@/server/db";
import {
	type apiCreateGitlab,
	type apiUpdateGitlab,
	type bitbucket,
	type github,
	gitlab,
	gitProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Github = typeof github.$inferSelect;
export type Bitbucket = typeof bitbucket.$inferSelect;
export type Gitlab = typeof gitlab.$inferSelect;

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

export const findGitlabById = async (gitlabId: string) => {
	const gitlabProviderResult = await db.query.gitlab.findFirst({
		where: eq(gitlab.gitlabId, gitlabId),
		with: {
			gitProvider: true,
		},
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
	input: typeof apiUpdateGitlab._type,
) => {
	return await db.transaction(async (tx) => {
		const result = await tx
			.update(gitlab)
			.set({
				...input,
			})
			.where(eq(gitlab.gitlabId, gitlabId))
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

export const updateGitlabComplete = async (
	gitlabId: string,
	input: Partial<Gitlab>,
) => {
	return await db
		.update(gitlab)
		.set({
			...input,
		})
		.where(eq(gitlab.gitlabId, gitlabId))
		.returning()
		.then((response) => response[0]);
};
