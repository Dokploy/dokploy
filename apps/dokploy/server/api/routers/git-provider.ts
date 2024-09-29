import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { apiRemoveGitProvider, gitProvider } from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { removeGitProvider } from "@dokploy/builders";

export const gitProviderRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async () => {
		return await db.query.gitProvider.findMany({
			with: {
				gitlab: true,
				bitbucket: true,
				github: true,
			},
			orderBy: desc(gitProvider.createdAt),
		});
	}),
	remove: protectedProcedure
		.input(apiRemoveGitProvider)
		.mutation(async ({ input }) => {
			try {
				return await removeGitProvider(input.gitProviderId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this git provider",
				});
			}
		}),
});
