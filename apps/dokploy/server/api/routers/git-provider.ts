import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateBitbucket,
	apiCreateGitlab,
	apiFindBitbucketBranches,
	apiFindGithubBranches,
	apiFindGitlabBranches,
	apiFindOneBitbucket,
	apiFindOneGithub,
	apiFindOneGitlab,
	apiRemoveGitProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createBitbucket,
	createGitlab,
	findBitbucketById,
	findGithubById,
	findGitlabById,
	haveGithubRequirements,
	removeGitProvider,
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
	oneGithub: protectedProcedure
		.input(apiFindOneGithub)
		.query(async ({ input }) => {
			return await findGithubById(input.githubId);
		}),
	oneGitlab: protectedProcedure
		.input(apiFindOneGitlab)
		.query(async ({ input }) => {
			return await findGitlabById(input.gitlabId);
		}),
	oneBitbucket: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input }) => {
			return await findBitbucketById(input.bitbucketId);
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
		.input(apiFindOneGitlab)
		.query(async ({ input }) => {
			return await getGitlabRepositories(input.gitlabId);
		}),

	getGitlabBranches: protectedProcedure
		.input(apiFindGitlabBranches)
		.query(async ({ input }) => {
			return await getGitlabBranches(input);
		}),
	getBitbucketRepositories: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input }) => {
			return await getBitbucketRepositories(input.bitbucketId);
		}),
	getBitbucketBranches: protectedProcedure
		.input(apiFindBitbucketBranches)
		.query(async ({ input }) => {
			return await getBitbucketBranches(input);
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
});
