import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateGitlab,
	apiFindGitlabBranches,
	apiFindOneGitlab,
	apiGitlabTestConnection,
	apiUpdateGitlab,
} from "@/server/db/schema";

import { db } from "@/server/db";
import {
	getGitlabBranches,
	getGitlabRepositories,
	haveGitlabRequirements,
	testGitlabConnection,
} from "@/server/utils/providers/gitlab";
import { TRPCError } from "@trpc/server";
import { updateGitProvider } from "../services/git-provider";
import { createGitlab, findGitlabById, updateGitlab } from "../services/gitlab";

export const gitlabRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateGitlab)
		.mutation(async ({ input }) => {
			try {
				return await createGitlab(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create this gitlab provider",
					cause: error,
				});
			}
		}),
	one: protectedProcedure.input(apiFindOneGitlab).query(async ({ input }) => {
		return await findGitlabById(input.gitlabId);
	}),
	gitlabProviders: protectedProcedure.query(async () => {
		const result = await db.query.gitlab.findMany({
			with: {
				gitProvider: true,
			},
		});
		const filtered = result
			.filter((provider) => haveGitlabRequirements(provider))
			.map((provider) => {
				return {
					gitlabId: provider.gitlabId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),
	getGitlabRepositories: protectedProcedure
		.input(apiFindOneGitlab)
		.query(async ({ input }) => {
			return await getGitlabRepositories(input.gitlabId);
		}),

	getGitlabBranches: protectedProcedure
		.input(apiFindGitlabBranches)
		.query(async ({ input }) => {
			return await getGitlabBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiGitlabTestConnection)
		.mutation(async ({ input }) => {
			try {
				const result = await testGitlabConnection(input);

				return `Found ${result} repositories`;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateGitlab)
		.mutation(async ({ input }) => {
			if (input.name) {
				await updateGitProvider(input.gitProviderId, {
					name: input.name,
				});
			} else {
				await updateGitlab(input.gitlabId, input);
			}
		}),
});
