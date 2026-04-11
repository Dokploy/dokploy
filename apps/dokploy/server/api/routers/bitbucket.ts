import {
	createBitbucket,
	findBitbucketById,
	getAccessibleGitProviderIds,
	getBitbucketBranches,
	getBitbucketRepositories,
	testBitbucketConnection,
	updateBitbucket,
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
	apiBitbucketTestConnection,
	apiCreateBitbucket,
	apiFindBitbucketBranches,
	apiFindOneBitbucket,
	apiUpdateBitbucket,
} from "@/server/db/schema";

export const bitbucketRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
		.meta({
			openapi: {
				summary: "Create Bitbucket provider",
				description: "Creates a new Bitbucket provider configuration linked to the active organization. Requires gitProviders create permission.",
			},
		})
		.input(apiCreateBitbucket)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createBitbucket(
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
					message: "Error creating this Bitbucket provider",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get Bitbucket provider",
				description: "Returns a single Bitbucket provider configuration by its ID.",
			},
		})
		.input(apiFindOneBitbucket)
		.query(async ({ input }) => {
			return await findBitbucketById(input.bitbucketId);
		}),
	bitbucketProviders: protectedProcedure
		.meta({
			openapi: {
				summary: "List Bitbucket providers",
				description: "Returns all Bitbucket providers accessible to the current user within the active organization.",
			},
		})
		.query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleGitProviderIds(ctx.session);

		let result = await db.query.bitbucket.findMany({
			with: {
				gitProvider: true,
			},
			columns: {
				bitbucketId: true,
			},
		});

		result = result.filter((provider) => {
			return (
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				accessibleIds.has(provider.gitProvider.gitProviderId)
			);
		});
		return result;
	}),

	getBitbucketRepositories: protectedProcedure
		.meta({
			openapi: {
				summary: "List Bitbucket repositories",
				description: "Fetches the list of repositories accessible by the Bitbucket provider. Calls the Bitbucket API using the provider's credentials.",
			},
		})
		.input(apiFindOneBitbucket)
		.query(async ({ input }) => {
			return await getBitbucketRepositories(input.bitbucketId);
		}),
	getBitbucketBranches: protectedProcedure
		.meta({
			openapi: {
				summary: "List Bitbucket branches",
				description: "Fetches the list of branches for a specific Bitbucket repository. Calls the Bitbucket API using the provider's credentials.",
			},
		})
		.input(apiFindBitbucketBranches)
		.query(async ({ input }) => {
			return await getBitbucketBranches(input);
		}),
	testConnection: protectedProcedure
		.meta({
			openapi: {
				summary: "Test Bitbucket connection",
				description: "Tests the connection to a Bitbucket provider by attempting to fetch its repositories. Returns the number of repositories found or throws an error on failure.",
			},
		})
		.input(apiBitbucketTestConnection)
		.mutation(async ({ input }) => {
			try {
				const result = await testBitbucketConnection(input);

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
				summary: "Update Bitbucket provider",
				description: "Updates a Bitbucket provider configuration. Requires gitProviders create permission.",
			},
		})
		.input(apiUpdateBitbucket)
		.mutation(async ({ input, ctx }) => {
			const result = await updateBitbucket(input.bitbucketId, {
				...input,
				organizationId: ctx.session.activeOrganizationId,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "gitProvider",
				resourceId: input.bitbucketId,
				resourceName: input.name,
			});

			return result;
		}),
});
