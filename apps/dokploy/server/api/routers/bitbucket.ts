import {
	createBitbucket,
	findBitbucketById,
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
import { assertGitProviderAccess } from "@/server/api/utils/git-provider";
import {
	apiBitbucketTestConnection,
	apiCreateBitbucket,
	apiFindBitbucketBranches,
	apiFindOneBitbucket,
	apiUpdateBitbucket,
} from "@/server/db/schema";

export const bitbucketRouter = createTRPCRouter({
	create: withPermission("gitProviders", "create")
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
		.input(apiFindOneBitbucket)
		.query(async ({ input, ctx }) => {
			const provider = await findBitbucketById(input.bitbucketId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return provider;
		}),
	bitbucketProviders: protectedProcedure.query(async ({ ctx }) => {
		let result = await db.query.bitbucket.findMany({
			with: {
				gitProvider: true,
			},
			columns: {
				bitbucketId: true,
			},
		});

		result = result.filter(
			(provider) =>
				provider.gitProvider.organizationId ===
				ctx.session.activeOrganizationId,
		);
		return result;
	}),

	getBitbucketRepositories: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input, ctx }) => {
			const provider = await findBitbucketById(input.bitbucketId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return await getBitbucketRepositories(input.bitbucketId);
		}),
	getBitbucketBranches: protectedProcedure
		.input(apiFindBitbucketBranches)
		.query(async ({ input, ctx }) => {
			const provider = await findBitbucketById(input.bitbucketId || "");
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
			return await getBitbucketBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiBitbucketTestConnection)
		.mutation(async ({ input, ctx }) => {
			try {
				const provider = await findBitbucketById(input.bitbucketId);
				assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
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
		.input(apiUpdateBitbucket)
		.mutation(async ({ input, ctx }) => {
			const provider = await findBitbucketById(input.bitbucketId);
			assertGitProviderAccess(provider, ctx.session.activeOrganizationId);
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
