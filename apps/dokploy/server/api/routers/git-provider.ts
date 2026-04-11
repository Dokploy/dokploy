import {
	findGitProviderById,
	getAccessibleGitProviderIds,
	removeGitProvider,
	updateGitProvider,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiRemoveGitProvider,
	apiToggleShareGitProvider,
	gitProvider,
} from "@/server/db/schema";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure
		.meta({
			openapi: {
				summary: "List all git providers",
				description: "Returns all git providers (GitHub, GitLab, Bitbucket, Gitea) accessible to the current user within the active organization, ordered by creation date.",
			},
		})
		.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		if (accessibleIds.size === 0) {
			return [];
		}

		const results = await db.query.gitProvider.findMany({
			with: {
				gitlab: true,
				bitbucket: true,
				github: true,
				gitea: true,
			},
			orderBy: desc(gitProvider.createdAt),
			where: inArray(gitProvider.gitProviderId, [...accessibleIds]),
		});

		return results.map((r) => ({
			...r,
			isOwner: r.userId === ctx.session.userId,
		}));
	}),

	toggleShare: protectedProcedure
		.meta({
			openapi: {
				summary: "Toggle git provider sharing",
				description: "Toggles whether a git provider is shared with the entire organization. Only the owner of the provider can change this setting.",
			},
		})
		.input(apiToggleShareGitProvider)
		.mutation(async ({ input, ctx }) => {
			const provider = await findGitProviderById(input.gitProviderId);

			if (
				provider.userId !== ctx.session.userId ||
				provider.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Only the owner can share this provider",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: provider.gitProviderId,
				resourceName: provider.name ?? provider.gitProviderId,
			});

			return await updateGitProvider(input.gitProviderId, {
				sharedWithOrganization: input.sharedWithOrganization,
			});
		}),

	allForPermissions: withPermission("member", "update")
		.meta({
			openapi: {
				summary: "List git providers for permissions",
				description: "Returns a minimal list of all git providers in the organization for use in permission assignment UIs. Requires a valid enterprise license and member update permission.",
			},
		})
		.use(async ({ ctx, next }) => {
			const licensed = await hasValidLicense(ctx.session.activeOrganizationId);
			if (!licensed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Valid enterprise license required",
				});
			}
			return next();
		})
		.query(async ({ ctx }) => {
			return await db.query.gitProvider.findMany({
				columns: {
					gitProviderId: true,
					name: true,
					providerType: true,
				},
				orderBy: desc(gitProvider.createdAt),
				where: eq(gitProvider.organizationId, ctx.session.activeOrganizationId),
			});
		}),

	remove: withPermission("gitProviders", "delete")
		.meta({
			openapi: {
				summary: "Remove git provider",
				description: "Deletes a git provider from the organization. Requires gitProviders delete permission and the provider must belong to the active organization.",
			},
		})
		.input(apiRemoveGitProvider)
		.mutation(async ({ input, ctx }) => {
			try {
				const gitProvider = await findGitProviderById(input.gitProviderId);

				if (gitProvider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to delete this Git provider",
					});
				}
				await audit(ctx, {
					action: "delete",
					resourceType: "gitProvider",
					resourceId: gitProvider.gitProviderId,
					resourceName: gitProvider.name ?? gitProvider.gitProviderId,
				});
				return await removeGitProvider(input.gitProviderId);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Error deleting this Git provider";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
});
