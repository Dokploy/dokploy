import { findGitProviderById, removeGitProvider } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { audit } from "@/server/api/utils/audit";
import { assertGitProviderAccess } from "@/server/api/utils/git-provider";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { apiRemoveGitProvider, gitProvider } from "@/server/db/schema";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.gitProvider.findMany({
			with: {
				gitlab: true,
				bitbucket: true,
				github: true,
				gitea: true,
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

				assertGitProviderAccess(gitProvider, ctx.session.activeOrganizationId);
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
