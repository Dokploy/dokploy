import {
	findGithubById,
	getAccessibleGitProviderIds,
	getGithubBranches,
	getGithubRepositories,
	haveGithubRequirements,
	updateGithub,
	updateGitProvider,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiFindGithubBranches,
	apiFindOneGithub,
	apiUpdateGithub,
} from "@/server/db/schema";

export const githubRouter = createTRPCRouter({
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get GitHub provider",
				description: "Returns a single GitHub provider configuration by its ID.",
			},
		})
		.input(apiFindOneGithub)
		.query(async ({ input }) => {
			return await findGithubById(input.githubId);
		}),
	getGithubRepositories: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitHub repositories",
				description: "Fetches the list of repositories accessible by the GitHub provider. Calls the GitHub API using the provider's credentials.",
			},
		})
		.input(apiFindOneGithub)
		.query(async ({ input }) => {
			return await getGithubRepositories(input.githubId);
		}),
	getGithubBranches: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitHub branches",
				description: "Fetches the list of branches for a specific GitHub repository. Calls the GitHub API using the provider's credentials.",
			},
		})
		.input(apiFindGithubBranches)
		.query(async ({ input }) => {
			return await getGithubBranches(input);
		}),
	githubProviders: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitHub providers",
				description: "Returns all GitHub providers accessible to the current user within the active organization, filtered to only those with valid credentials.",
			},
		})
		.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.github.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId),
		);

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
		.meta({
			openapi: {
				summary: "Test GitHub connection",
				description: "Tests the connection to a GitHub provider by attempting to fetch its repositories. Returns the number of repositories found or throws an error on failure.",
			},
		})
		.input(apiFindOneGithub)
		.mutation(async ({ input }) => {
			try {
				const result = await getGithubRepositories(input.githubId);
				return `Found ${result.length} repositories`;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: err instanceof Error ? err?.message : `Error: ${err}`,
				});
			}
		}),
	update: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Update GitHub provider",
				description: "Updates a GitHub provider configuration and its associated git provider record. Requires gitProviders create permission.",
			},
		})
		.input(apiUpdateGithub)
		.mutation(async ({ input, ctx }) => {
			await updateGitProvider(input.gitProviderId, {
				name: input.name,
				organizationId: ctx.session.activeOrganizationId,
			});

			await updateGithub(input.githubId, {
				...input,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.gitProviderId,
				resourceName: input.name,
			});
		}),
});
