import { findGitProviderById, removeGitProvider } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
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
			where: and(
				eq(gitProvider.userId, ctx.session.userId),
				eq(gitProvider.organizationId, ctx.session.activeOrganizationId),
			),
		});
	}),
	remove: protectedProcedure
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
