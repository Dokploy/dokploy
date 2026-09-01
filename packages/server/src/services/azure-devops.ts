import { db } from "@dokploy/server/db";
import {
	type apiCreateAzureDevops,
	type apiUpdateAzureDevops,
	azureDevops,
	gitProvider,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";

export type AzureDevops = typeof azureDevops.$inferSelect;

export const createAzureDevops = async (
	input: z.infer<typeof apiCreateAzureDevops>,
	organizationId: string,
	userId: string,
) =>
	db.transaction(async (tx) => {
		const provider = await tx
			.insert(gitProvider)
			.values({
				providerType: "azureDevops",
				organizationId,
				name: input.name,
				userId,
			})
			.returning()
			.then((rows) => rows[0]);
		if (!provider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the Azure DevOps provider",
			});
		}
		return tx
			.insert(azureDevops)
			.values({
				organizationName: input.organizationName,
				personalAccessToken: input.personalAccessToken,
				gitProviderId: provider.gitProviderId,
			})
			.returning()
			.then((rows) => rows[0]);
	});

export const findAzureDevopsById = async (azureDevopsId: string) => {
	const provider = await db.query.azureDevops.findFirst({
		where: eq(azureDevops.azureDevopsId, azureDevopsId),
		with: { gitProvider: true },
	});
	if (!provider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Azure DevOps provider not found",
		});
	}
	return provider;
};

export const updateAzureDevops = async (
	azureDevopsId: string,
	input: z.infer<typeof apiUpdateAzureDevops>,
) =>
	db.transaction(async (tx) => {
		const current = await tx.query.azureDevops.findFirst({
			where: eq(azureDevops.azureDevopsId, azureDevopsId),
		});
		if (!current) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Azure DevOps provider not found",
			});
		}
		const updated = await tx
			.update(azureDevops)
			.set({
				organizationName: input.organizationName,
				personalAccessToken: input.personalAccessToken,
			})
			.where(eq(azureDevops.azureDevopsId, azureDevopsId))
			.returning()
			.then((rows) => rows[0]);
		await tx
			.update(gitProvider)
			.set({ name: input.name, organizationId: input.organizationId })
			.where(eq(gitProvider.gitProviderId, current.gitProviderId));
		return updated;
	});
