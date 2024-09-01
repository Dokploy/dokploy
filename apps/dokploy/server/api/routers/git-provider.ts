import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateBitbucketProvider,
	apiCreateGitlabProvider,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createBitbucketProvider,
	createGitlabProvider,
	getBitbucketProvider,
	getGitlabProvider,
	haveGithubRequirements,
	haveGitlabRequirements,
	removeGithubProvider,
} from "../services/git-provider";
import { z } from "zod";

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
			if (!input.gitlabProviderId) {
				return [];
			}
			const gitlabProvider = await getGitlabProvider(input.gitlabProviderId);
			const response = await fetch(
				`https://gitlab.com/api/v4/projects?membership=true&owned=true&page=${0}&per_page=${100}`,
				{
					headers: {
						Authorization: `Bearer ${gitlabProvider.accessToken}`,
					},
				},
			);

			if (!response.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to fetch repositories: ${response.statusText}`,
				});
			}

			const repositories = await response.json();
			return repositories as {
				name: string;
				url: string;
				owner: {
					username: string;
				};
			}[];
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
			if (!input.gitlabProviderId) {
				return [];
			}
			const gitlabProvider = await getGitlabProvider(input.gitlabProviderId);

			const projectResponse = await fetch(
				`https://gitlab.com/api/v4/projects?search=${input.repo}&owned=true&page=1&per_page=100`,
				{
					headers: {
						Authorization: `Bearer ${gitlabProvider.refreshToken}`,
					},
				},
			);

			if (!projectResponse.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to fetch repositories: ${projectResponse.statusText}`,
				});
			}

			const projects = await projectResponse.json();
			const project = projects.find(
				(p) => p.namespace.path === input.owner && p.name === input.repo,
			);

			if (!project) {
				throw new Error(`Project not found: ${input.owner}/${input.repo}`);
			}

			const branchesResponse = await fetch(
				`https://gitlab.com/api/v4/projects/${project.id}/repository/branches`,
				{
					headers: {
						Authorization: `Bearer ${gitlabProvider.accessToken}`,
					},
				},
			);

			if (!branchesResponse.ok) {
				throw new Error(
					`Failed to fetch branches: ${branchesResponse.statusText}`,
				);
			}

			const branches = await branchesResponse.json();

			return branches as {
				name: string;
				commit: {
					id: string;
				};
			}[];
		}),
	getBitbucketRepositories: protectedProcedure
		.input(
			z.object({
				bitbucketProviderId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			if (!input.bitbucketProviderId) {
				return [];
			}
			const bitbucketProvider = await getBitbucketProvider(
				input.bitbucketProviderId,
			);

			const url = `https://api.bitbucket.org/2.0/repositories/${bitbucketProvider.bitbucketUsername}`;

			try {
				const response = await fetch(url, {
					method: "GET",
					headers: {
						Authorization: `Basic ${Buffer.from(`${bitbucketProvider.bitbucketUsername}:${bitbucketProvider.appPassword}`).toString("base64")}`,
					},
				});

				if (!response.ok) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Failed to fetch repositories: ${response.statusText}`,
					});
				}

				const data = await response.json();

				const mappedData = data.values.map((repo) => {
					return {
						name: repo.name,
						url: repo.links.html.href,
						owner: {
							username: repo.workspace.slug,
						},
					};
				});

				return mappedData as {
					name: string;
					url: string;
					owner: {
						username: string;
					};
				}[];
			} catch (error) {
				throw error;
			}
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
			if (!input.bitbucketProviderId) {
				return [];
			}
			const bitbucketProvider = await getBitbucketProvider(
				input.bitbucketProviderId,
			);
			const { owner, repo } = input;
			const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/refs/branches`;

			try {
				const response = await fetch(url, {
					method: "GET",
					headers: {
						Authorization: `Basic ${Buffer.from(`${bitbucketProvider.bitbucketUsername}:${bitbucketProvider.appPassword}`).toString("base64")}`,
					},
				});

				if (!response.ok) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `HTTP error! status: ${response.status}`,
					});
				}

				const data = await response.json();

				const mappedData = data.values.map((branch) => {
					return {
						name: branch.name,
						commit: {
							sha: branch.target.hash,
						},
					};
				});

				return mappedData as {
					name: string;
					commit: {
						sha: string;
					};
				}[];
			} catch (error) {
				throw error;
			}
		}),
});
