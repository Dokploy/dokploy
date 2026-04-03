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
import { audit } from "@/server/api/utils/audit";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import {
	apiRemoveGitProvider,
	apiToggleShareGitProvider,
	gitProvider,
} from "@/server/db/schema";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
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
