import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { apiFindGithubBranches, apiFindOneGithub } from "@/server/db/schema";
import { db } from "@/server/db";
import { findGithubById, haveGithubRequirements } from "../services/github";
import {
	getGithubRepositories,
	getGithubBranches,
} from "@/server/utils/providers/github";

export const githubRouter = createTRPCRouter({
	one: protectedProcedure.input(apiFindOneGithub).query(async ({ input }) => {
		return await findGithubById(input.githubId);
	}),
	getGithubRepositories: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input }) => {
			return await getGithubRepositories(input.githubId);
		}),
	getGithubBranches: protectedProcedure
		.input(apiFindGithubBranches)
		.query(async ({ input }) => {
			return await getGithubBranches(input);
		}),
	githubProviders: protectedProcedure.query(async () => {
		const result = await db.query.github.findMany({
			with: {
				gitProvider: true,
			},
		});

		const filtered = result
			.filter((provider) => haveGithubRequirements(provider))
			.map((provider) => {
				return {
					githubId: provider.githubId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),
	testConnection: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input }) => {
			return await findGithubById(input.githubId);
		}),
});
