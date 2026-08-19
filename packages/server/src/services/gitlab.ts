import { db } from "@dokploy/server/db";
import {
	type apiCreateGitlab,
	gitlab,
	gitProvider,
} from "@dokploy/server/db/schema";
import { assertGitProviderAccess } from "@dokploy/server/services/git-provider";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

export type Gitlab = typeof gitlab.$inferSelect;

export const createGitlab = async (
	input: z.infer<typeof apiCreateGitlab>,
	organizationId: string,
	userId: string,
) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "gitlab",
				organizationId: organizationId,
				name: input.name,
				userId: userId,
			})
			.returning()
			.then((response) => response[0]);

		if (!newGitProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the Git provider",
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

export const assertGitlabProviderAccess = async (
	gitlabId: string,
	session: { userId: string; activeOrganizationId: string },
) => {
	const gitlabProvider = await findGitlabById(gitlabId);

	if (
		gitlabProvider.gitProvider.organizationId !== session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this GitLab provider",
		});
	}

	await assertGitProviderAccess(
		gitlabProvider.gitProvider.gitProviderId,
		session,
		"You are not authorized to access this GitLab provider",
	);

	return gitlabProvider;
};

export const updateGitlab = async (
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
