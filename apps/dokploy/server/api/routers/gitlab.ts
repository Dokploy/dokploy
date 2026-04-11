import {
	createGitlab,
	findGitlabById,
	getAccessibleGitProviderIds,
	getGitlabBranches,
	getGitlabRepositories,
	haveGitlabRequirements,
	testGitlabConnection,
	updateGitlab,
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
	apiCreateGitlab,
	apiFindGitlabBranches,
	apiFindOneGitlab,
	apiGitlabTestConnection,
	apiUpdateGitlab,
} from "@/server/db/schema";

export const gitlabRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Create GitLab provider",
				description: "Creates a new GitLab provider configuration linked to the active organization. Requires gitProviders create permission.",
			},
		})
		.input(apiCreateGitlab)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createGitlab(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);

				await audit(ctx, {
					action: "create",
					resourceType: "gitProvider",
					resourceName: input.name,
				});

				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating this Gitlab provider",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get GitLab provider",
				description: "Returns a single GitLab provider configuration by its ID.",
			},
		})
		.input(apiFindOneGitlab)
		.query(async ({ input }) => {
			return await findGitlabById(input.gitlabId);
		}),
	gitlabProviders: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitLab providers",
				description: "Returns all GitLab providers accessible to the current user within the active organization, filtered to only those with valid credentials.",
			},
		})
		.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.gitlab.findMany({
			with: {
				gitProvider: true,
			},
		});

		result = result.filter((provider) => {
			return (
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId)
			);
		});
		const filtered = result
			.filter((provider) => haveGitlabRequirements(provider))
			.map((provider) => {
				return {
					gitlabId: provider.gitlabId,
					gitProvider: {
						...provider.gitProvider,
					},
					gitlabUrl: provider.gitlabUrl,
				};
			});

		return filtered;
	}),
	getGitlabRepositories: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitLab repositories",
				description: "Fetches the list of repositories accessible by the GitLab provider. Calls the GitLab API using the provider's credentials.",
			},
		})
		.input(apiFindOneGitlab)
		.query(async ({ input }) => {
			return await getGitlabRepositories(input.gitlabId);
		}),

	getGitlabBranches: protectedProcedure
		.meta({
			openapi: {
				summary: "List GitLab branches",
				description: "Fetches the list of branches for a specific GitLab repository. Calls the GitLab API using the provider's credentials.",
			},
		})
		.input(apiFindGitlabBranches)
		.query(async ({ input }) => {
			return await getGitlabBranches(input);
		}),
	testConnection: protectedProcedure
		.meta({
			openapi: {
				summary: "Test GitLab connection",
				description: "Tests the connection to a GitLab provider by attempting to fetch its repositories. Returns the number of repositories found or throws an error on failure.",
			},
		})
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
	update: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Update GitLab provider",
				description: "Updates a GitLab provider configuration and its associated git provider record. Requires gitProviders create permission.",
			},
		})
		.input(apiUpdateGitlab)
		.mutation(async ({ input, ctx }) => {
			if (input.name) {
				await updateGitProvider(input.gitProviderId, {
					name: input.name,
					organizationId: ctx.session.activeOrganizationId,
				});

				await updateGitlab(input.gitlabId, {
					...input,
				});
			} else {
				await updateGitlab(input.gitlabId, {
					...input,
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.gitProviderId,
				resourceName: input.name,
			});
		}),
});
