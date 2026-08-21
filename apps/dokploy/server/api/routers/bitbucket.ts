import {
	assertGitProviderAccess,
	createBitbucket,
	findBitbucketById,
	getAccessibleGitProviderIds,
	getBitbucketBranch,
	getBitbucketBranches,
	getBitbucketRepositories,
	getBitbucketRepository,
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
	apiFindBranch,
	apiFindOneBitbucket,
	apiFindRepository,
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
			const bitbucket = await findBitbucketById(input.bitbucketId);
			await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
			return bitbucket;
		}),
	bitbucketProviders: protectedProcedure.query(async ({ ctx }) => {
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
		.input(apiFindOneBitbucket)
		.query(async ({ input, ctx }) => {
			const bitbucket = await findBitbucketById(input.bitbucketId);
			await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
			return await getBitbucketRepositories(input.bitbucketId);
		}),
	getBitbucketRepository: protectedProcedure
		.input(
			apiFindRepository.extend({
				bitbucketId: apiFindOneBitbucket.shape.bitbucketId,
			}),
		)
		.query(async ({ input, ctx }) => {
			const bitbucket = await findBitbucketById(input.bitbucketId);
			await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
			return await getBitbucketRepository(
				input.bitbucketId,
				input.owner,
				input.repository,
			);
		}),
	getBitbucketBranches: protectedProcedure
		.input(apiFindBitbucketBranches)
		.query(async ({ input, ctx }) => {
			if (input.bitbucketId) {
				const bitbucket = await findBitbucketById(input.bitbucketId);
				await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
			}
			return await getBitbucketBranches(input);
		}),
	getBitbucketBranch: protectedProcedure
		.input(
			apiFindBranch.extend({
				bitbucketId: apiFindOneBitbucket.shape.bitbucketId,
			}),
		)
		.query(async ({ input, ctx }) => {
			const bitbucket = await findBitbucketById(input.bitbucketId);
			await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
			return await getBitbucketBranch(
				input.bitbucketId,
				input.owner,
				input.repository,
				input.branch,
			);
		}),
	testConnection: protectedProcedure
		.input(apiBitbucketTestConnection)
		.mutation(async ({ input, ctx }) => {
			try {
				const bitbucket = await findBitbucketById(input.bitbucketId);
				await assertGitProviderAccess(ctx.session, bitbucket.gitProvider);
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
