import {
	createBitbucket,
	findBitbucketById,
	getBitbucketBranches,
	getBitbucketRepositories,
	testBitbucketConnection,
	updateBitbucket,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiBitbucketTestConnection,
	apiCreateBitbucket,
	apiFindBitbucketBranches,
	apiFindOneBitbucket,
	apiUpdateBitbucket,
} from "@/server/db/schema";

export const bitbucketRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBitbucket)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createBitbucket(
					input,
					ctx.session.activeOrganizationId,
					ctx.session.userId,
				);
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
			const bitbucketProvider = await findBitbucketById(input.bitbucketId);
			if (
				bitbucketProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				bitbucketProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this bitbucket provider",
				});
			}
			return bitbucketProvider;
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

		result = result.filter((provider) => {
			return (
				provider.gitProvider.organizationId ===
					ctx.session.activeOrganizationId &&
				provider.gitProvider.userId === ctx.session.userId
			);
		});
		return result;
	}),

	getBitbucketRepositories: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input, ctx }) => {
			const bitbucketProvider = await findBitbucketById(input.bitbucketId);
			if (
				bitbucketProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				bitbucketProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this bitbucket provider",
				});
			}
			return await getBitbucketRepositories(input.bitbucketId);
		}),
	getBitbucketBranches: protectedProcedure
		.input(apiFindBitbucketBranches)
		.query(async ({ input, ctx }) => {
			const bitbucketProvider = await findBitbucketById(
				input.bitbucketId || "",
			);
			if (
				bitbucketProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				bitbucketProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this bitbucket provider",
				});
			}
			return await getBitbucketBranches(input);
		}),
	testConnection: protectedProcedure
		.input(apiBitbucketTestConnection)
		.mutation(async ({ input, ctx }) => {
			try {
				const bitbucketProvider = await findBitbucketById(input.bitbucketId);
				if (
					bitbucketProvider.gitProvider.organizationId !==
						ctx.session.activeOrganizationId &&
					bitbucketProvider.gitProvider.userId !== ctx.session.userId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not allowed to access this bitbucket provider",
					});
				}
				const result = await testBitbucketConnection(input);

				return `Found ${result} repositories`;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateBitbucket)
		.mutation(async ({ input, ctx }) => {
			const bitbucketProvider = await findBitbucketById(input.bitbucketId);
			if (
				bitbucketProvider.gitProvider.organizationId !==
					ctx.session.activeOrganizationId &&
				bitbucketProvider.gitProvider.userId !== ctx.session.userId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this bitbucket provider",
				});
			}
			return await updateBitbucket(input.bitbucketId, {
				...input,
				organizationId: ctx.session.activeOrganizationId,
			});
		}),
});
