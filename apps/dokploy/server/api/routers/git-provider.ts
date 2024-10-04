import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { apiRemoveGitProvider, gitProvider } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { findGitProviderById, removeGitProvider } from "@dokploy/builders";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return await db.query.gitProvider.findMany({
			with: {
				gitlab: true,
				bitbucket: true,
				github: true,
			},
			orderBy: desc(gitProvider.createdAt),
			// where: eq(gitProvider.adminId, ctx.user.adminId), //TODO: Remove this line when the cloud version is ready
		});
	}),
	remove: protectedProcedure
		.input(apiRemoveGitProvider)
		.mutation(async ({ input, ctx }) => {
			try {
				const gitProvider = await findGitProviderById(input.gitProviderId);

				// if (gitProvider.adminId !== ctx.user.adminId) {
				// 	throw new TRPCError({
				// 		code: "UNAUTHORIZED",
				// 		message: "You are not allowed to delete this git provider",
				// 	});
				// }
				return await removeGitProvider(input.gitProviderId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this git provider",
				});
			}
		}),
});
