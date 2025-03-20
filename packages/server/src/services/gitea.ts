// @ts-ignore: Cannot find module errors
import { db } from "@dokploy/server/db";
// @ts-ignore: Cannot find module errors
import {
	type apiCreateGitea,
	gitProvider,
	gitea,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export type Gitea = typeof gitea.$inferSelect;

export const createGitea = async (
	input: typeof apiCreateGitea._type,
	organizationId: string,
) => {
	// @ts-ignore - Complex transaction type - Added because proper typing in Drizzle in not sufficient
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "gitea",
				organizationId: organizationId,
				name: input.name,
			})
			.returning()
			.then((response: (typeof gitProvider.$inferSelect)[]) => response[0]);

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

		// Return just the essential data needed by the frontend
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
			console.error("No Gitea Provider found:", { giteaId });
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Gitea Provider not found",
			});
		}

		return giteaProviderResult;
	} catch (error) {
		console.error("Error finding Gitea Provider:", error);
		throw error;
	}
};

export const updateGitea = async (giteaId: string, input: Partial<Gitea>) => {
	console.log("Updating Gitea Provider:", {
		giteaId,
		updateData: {
			accessTokenPresent: !!input.accessToken,
			refreshTokenPresent: !!input.refreshToken,
			expiresAt: input.expiresAt,
		},
	});

	try {
		const updateResult = await db
			.update(gitea)
			.set(input)
			.where(eq(gitea.giteaId, giteaId))
			.returning();

		const result = updateResult[0] as Gitea | undefined;

		if (!result) {
			console.error("No rows were updated", { giteaId, input });
			throw new Error(`Failed to update Gitea provider with ID ${giteaId}`);
		}

		return result;
	} catch (error) {
		console.error("Error updating Gitea provider:", error);
		throw error;
	}
};
