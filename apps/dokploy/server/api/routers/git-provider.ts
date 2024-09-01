import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateBitbucketProvider,
	apiCreateGitlabProvider,
	apiGetBranches,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createBitbucketProvider,
	createGitlabProvider,
	haveGithubRequirements,
	removeGithubProvider,
} from "../services/git-provider";
import { z } from "zod";
import {
	getGitlabBranches,
	getGitlabRepositories,
	haveGitlabRequirements,
} from "@/server/utils/providers/gitlab";
import {
	getBitbucketBranches,
	getBitbucketRepositories,
} from "@/server/utils/providers/bitbucket";
import {
	getGithubBranches,
	getGithubRepositories,
} from "@/server/utils/providers/github";

export const gitProvider = createTRPCRouter({
	getAll: protectedProcedure.query(async () => {
		return await db.query.gitProvider.findMany({
			with: {
				gitlabProvider: true,
				bitbucketProvider: true,
				githubProvider: true,
			},
		});
	}),
	remove: protectedProcedure
		.input(z.object({ gitProviderId: z.string() }))
		.mutation(async ({ input }) => {
			try {
				return await removeGithubProvider(input.gitProviderId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this git provider",
				});
			}
		}),
	createGitlabProvider: protectedProcedure
		.input(apiCreateGitlabProvider)
		.mutation(async ({ input }) => {
			try {
				return await createGitlabProvider(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create this gitlab provider",
					cause: error,
				});
			}
		}),
	createBitbucketProvider: protectedProcedure
		.input(apiCreateBitbucketProvider)
		.mutation(async ({ input }) => {
			try {
				return await createBitbucketProvider(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create this bitbucket provider",
					cause: error,
				});
			}
		}),
	githubProviders: protectedProcedure.query(async () => {
		const result = await db.query.githubProvider.findMany({
			with: {
				gitProvider: true,
			},
		});

		const filtered = result
			.filter((provider) => haveGithubRequirements(provider))
			.map((provider) => {
				return {
					githubProviderId: provider.githubProviderId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),
	gitlabProviders: protectedProcedure.query(async () => {
		const result = await db.query.gitlabProvider.findMany({
			with: {
				gitProvider: true,
			},
		});
		const filtered = result
			.filter((provider) => haveGitlabRequirements(provider))
			.map((provider) => {
				return {
					gitlabProviderId: provider.gitlabProviderId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),
	bitbucketProviders: protectedProcedure.query(async () => {
		const result = await db.query.bitbucketProvider.findMany({
			with: {
				gitProvider: true,
			},
			columns: {
				bitbucketProviderId: true,
			},
		});
		return result;
	}),

	getGitlabRepositories: protectedProcedure
		.input(
			z.object({
				gitlabProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getGitlabRepositories(input);
		}),

	getGitlabBranches: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				gitlabProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getGitlabBranches(input);
		}),
	getBitbucketRepositories: protectedProcedure
		.input(
			z.object({
				bitbucketProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getBitbucketRepositories(input);
		}),
	getBitbucketBranches: protectedProcedure
		.input(
			z.object({
				owner: z.string(),
				repo: z.string(),
				bitbucketProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getBitbucketBranches(input);
		}),
	getRepositories: protectedProcedure
		.input(
			z.object({
				githubProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getGithubRepositories(input);
		}),
	getBranches: protectedProcedure
		.input(apiGetBranches)
		.query(async ({ input }) => {
			return await getGithubBranches(input);
		}),
});
