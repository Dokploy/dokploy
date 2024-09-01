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
				gitlab: true,
				bitbucket: true,
				github: true,
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
					githubId: provider.githubId,
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
					gitlabId: provider.gitlabId,
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
				bitbucketId: true,
			},
		});
		return result;
	}),

	getGitlabRepositories: protectedProcedure
		.input(
			z.object({
				gitlabId: z.string().optional(),
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
				gitlabId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getGitlabBranches(input);
		}),
	getBitbucketRepositories: protectedProcedure
		.input(
			z.object({
				bitbucketId: z.string().optional(),
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
				bitbucketId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getBitbucketBranches(input);
		}),
	getRepositories: protectedProcedure
		.input(
			z.object({
				githubId: z.string().optional(),
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
// 1725175543
// {
// 	access_token: '11d422887d8fac712191ee9b09dfdb043a705938cd67a4a39f36b4bc65b3106d',
// 	token_type: 'Bearer',
// 	expires_in: 7200,
// 	refresh_token: '3806d8022d32886c19d91eb9d1cea9328b864387f39c5d0469d08c48e18b674e',
// 	scope: 'api read_user read_repository',
// 	created_at: 1725167656
//   }
// {
// 	access_token: 'd256b52b10bf72ebf2784f8c0528e48a04a7d249c28695b6cc105b47b09c7336',
// 	token_type: 'Bearer',
// 	expires_in: 7200,
// 	refresh_token: '265eb87d0bbef410e0c30a2c239c4fa3698943219a439fb43cf2f8227d1fcaf2',
// 	scope: 'api read_user read_repository',
// 	created_at: 1725167803
//   }
