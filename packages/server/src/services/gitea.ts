import { db } from "@dokploy/server/db";
import {
	type apiCreateGitea,
	gitea,
	gitProvider,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Gitea = typeof gitea.$inferSelect;

export const createGitea = async (
	input: typeof apiCreateGitea._type,
	organizationId: string,
	userId: string,
) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "gitea",
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

		const giteaProvider = await tx
			.insert(gitea)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response: (typeof gitea.$inferSelect)[]) => response[0]);

		if (!giteaProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the Gitea provider",
			});
		}

		return {
			giteaId: giteaProvider.giteaId,
			clientId: giteaProvider.clientId,
			giteaUrl: giteaProvider.giteaUrl,
		};
	});
};

export const findGiteaById = async (giteaId: string) => {
	try {
		const giteaProviderResult = await db.query.gitea.findFirst({
			where: eq(gitea.giteaId, giteaId),
			with: {
				gitProvider: true,
			},
		});

		if (!giteaProviderResult) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea Provider not found",
			});
		}

		return giteaProviderResult;
	} catch (error) {
		throw error;
	}
};

export const updateGitea = async (giteaId: string, input: Partial<Gitea>) => {
	try {
		const updateResult = await db
			.update(gitea)
			.set(input)
			.where(eq(gitea.giteaId, giteaId))
			.returning();

		const result = updateResult[0] as Gitea | undefined;

		if (!result) {
			throw new Error(`Failed to update Gitea provider with ID ${giteaId}`);
		}

		return result;
	} catch (error) {
		throw error;
	}
};
