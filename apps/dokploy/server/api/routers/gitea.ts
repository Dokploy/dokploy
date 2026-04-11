import {
	createGitea,
	findGiteaById,
	getAccessibleGitProviderIds,
	getGiteaBranches,
	getGiteaRepositories,
	haveGiteaRequirements,
	testGiteaConnection,
	updateGitea,
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
	apiCreateGitea,
	apiFindGiteaBranches,
	apiFindOneGitea,
	apiGiteaTestConnection,
	apiUpdateGitea,
} from "@/server/db/schema";

export const giteaRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Create Gitea provider",
				description: "Creates a new Gitea provider configuration linked to the active organization. Requires gitProviders create permission.",
			},
		})
		.input(apiCreateGitea)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createGitea(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);

				await audit(ctx, {
					action: "create",
					resourceType: "gitProvider",
					resourceId: result.giteaId,
					resourceName: input.name,
				});

				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating this Gitea provider",
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get Gitea provider",
				description: "Returns a single Gitea provider configuration by its ID.",
			},
		})
		.input(apiFindOneGitea)
		.query(async ({ input }) => {
			return await findGiteaById(input.giteaId);
		}),

	giteaProviders: protectedProcedure
		.meta({
			openapi: {
				summary: "List Gitea providers",
				description: "Returns all Gitea providers accessible to the current user within the active organization, filtered to only those with valid credentials.",
			},
		})
		.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.gitea.findMany({
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
			.filter((provider) => haveGiteaRequirements(provider))
			.map((provider) => {
				return {
					giteaId: provider.giteaId,
					gitProvider: {
						...provider.gitProvider,
					},
				};
			});

		return filtered;
	}),

	getGiteaRepositories: protectedProcedure
		.meta({
			openapi: {
				summary: "List Gitea repositories",
				description: "Fetches the list of repositories accessible by the Gitea provider. Calls the Gitea API using the provider's credentials.",
			},
		})
		.input(apiFindOneGitea)
		.query(async ({ input }) => {
			const { giteaId } = input;

			if (!giteaId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Gitea provider ID is required.",
				});
			}

			try {
				const repositories = await getGiteaRepositories(giteaId);
				return repositories;
			} catch (error) {
				console.error("Error fetching Gitea repositories:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	getGiteaBranches: protectedProcedure
		.meta({
			openapi: {
				summary: "List Gitea branches",
				description: "Fetches the list of branches for a specific Gitea repository. Calls the Gitea API using the provider's credentials.",
			},
		})
		.input(apiFindGiteaBranches)
		.query(async ({ input }) => {
			const { giteaId, owner, repositoryName } = input;

			if (!giteaId || !owner || !repositoryName) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Gitea provider ID, owner, and repository name are required.",
				});
			}

			try {
				return await getGiteaBranches({
					giteaId,
					owner,
					repo: repositoryName,
				});
			} catch (error) {
				console.error("Error fetching Gitea branches:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	testConnection: protectedProcedure
		.meta({
			openapi: {
				summary: "Test Gitea connection",
				description: "Tests the connection to a Gitea provider by attempting to fetch its repositories. Returns the number of repositories found or throws an error on failure.",
			},
		})
		.input(apiGiteaTestConnection)
		.mutation(async ({ input }) => {
			const giteaId = input.giteaId ?? "";

			try {
				const result = await testGiteaConnection({
					giteaId,
				});

				return `Found ${result} repositories`;
			} catch (error) {
				console.error("Gitea connection test error:", error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	update: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Update Gitea provider",
				description: "Updates a Gitea provider configuration and its associated git provider record. Requires gitProviders create permission.",
			},
		})
		.input(apiUpdateGitea)
		.mutation(async ({ input, ctx }) => {
			if (input.name) {
				await updateGitProvider(input.gitProviderId, {
					name: input.name,
					organizationId: ctx.session.activeOrganizationId,
				});

				await updateGitea(input.giteaId, {
					...input,
				});
			} else {
				await updateGitea(input.giteaId, {
					...input,
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.giteaId,
				resourceName: input.name,
			});

			return { success: true };
		}),

	getGiteaUrl: protectedProcedure
		.meta({
			openapi: {
				summary: "Get Gitea instance URL",
				description: "Returns the base URL of the Gitea instance associated with the given provider ID.",
			},
		})
		.input(apiFindOneGitea)
		.query(async ({ input }) => {
			const { giteaId } = input;

			if (!giteaId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Gitea provider ID is required.",
				});
			}

			const giteaProvider = await findGiteaById(giteaId);

			// Return the base URL of the Gitea instance
			return giteaProvider.giteaUrl;
		}),
});
