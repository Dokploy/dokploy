import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateBitbucket,
	apiCreateGitlab,
	apiGetBranches,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createBitbucket,
	createGitlab,
	haveGithubRequirements,
	removeGithub,
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
				return await removeGithub(input.gitProviderId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this git provider",
				});
			}
		}),
	createGitlab: protectedProcedure
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
	createBitbucket: protectedProcedure
		.input(apiCreateBitbucket)
		.mutation(async ({ input }) => {
			try {
				return await createBitbucket(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create this bitbucket provider",
					cause: error,
				});
			}
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
	bitbucketProviders: protectedProcedure.query(async () => {
		const result = await db.query.bitbucket.findMany({
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
				id: z.number().nullable(),
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
	// getGithub: protectedProcedure
	// 	.input(apiGetGithub)
	// 	.query(async ({ input }) => {
	// 		return await findGithub(input);
	// 	}),
});
