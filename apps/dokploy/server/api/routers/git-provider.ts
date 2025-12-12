import {
	findGitProviderById,
	findMemberById,
	removeGitProvider,
	updateGitProvider,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, or } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiRemoveGitProvider,
	apiUpdateSharedInOrg,
	gitProvider,
} from "@/server/db/schema";

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
				or(
					eq(gitProvider.sharedInOrg, true),
					eq(gitProvider.userId, ctx.session.userId),
				),
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
	updateSharedInOrg: protectedProcedure
		.input(apiUpdateSharedInOrg)
		.mutation(async ({ input, ctx }) => {
			const gitProvider = await findGitProviderById(input.gitProviderId);
			if (
				gitProvider.organizationId !== ctx.session.activeOrganizationId ||
				gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this Git provider",
				});
			}

			// Check if user has permission to share git providers
			const member = await findMemberById(
				ctx.session.userId,
				ctx.session.activeOrganizationId,
			);
			if (!member.canShareGitProviders) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message:
						"You don't have permission to share Git providers in the organization",
				});
			}

			return await updateGitProvider(input.gitProviderId, {
				sharedInOrg: input.sharedInOrg,
			});
		}),
});
