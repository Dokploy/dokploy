import { db } from "@dokploy/server/db";
import {
	type apiCreateGitlab,
	gitlab,
	gitProvider,
} from "@dokploy/server/db/schema";
import { secretUpdateValue } from "@dokploy/server/utils/security/redaction";
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
		const { webhookSecret, ...gitlabInput } = input;
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
				...gitlabInput,
				gitProviderId: newGitProvider?.gitProviderId,
				webhookSecret: secretUpdateValue(webhookSecret),
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

export const findGitlabGitProviderId = async (gitlabId: string) => {
	const gitlabProviderResult = await db.query.gitlab.findFirst({
		where: eq(gitlab.gitlabId, gitlabId),
		columns: {
			gitProviderId: true,
		},
	});

	if (!gitlabProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Gitlab Provider not found",
		});
	}

	return gitlabProviderResult.gitProviderId;
};

export const updateGitlab = async (
	gitlabId: string,
	input: Partial<Gitlab>,
) => {
	const { webhookSecret, ...gitlabInput } = input;
	const nextWebhookSecret = secretUpdateValue(webhookSecret);
	return await db
		.update(gitlab)
		.set({
			...gitlabInput,
			...(nextWebhookSecret !== undefined && {
				webhookSecret: nextWebhookSecret,
			}),
		})
		.where(eq(gitlab.gitlabId, gitlabId))
		.returning()
		.then((response) => response[0]);
};
