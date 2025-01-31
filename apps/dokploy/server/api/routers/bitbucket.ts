import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiBitbucketTestConnection,
	apiCreateBitbucket,
	apiFindBitbucketBranches,
	apiFindOneBitbucket,
	apiUpdateBitbucket,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createBitbucket,
	findBitbucketById,
	getBitbucketBranches,
	getBitbucketRepositories,
	testBitbucketConnection,
	updateBitbucket,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";

export const bitbucketRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateBitbucket)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createBitbucket(input, ctx.user.adminId);
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
				IS_CLOUD &&
				bitbucketProvider.gitProvider.adminId !== ctx.user.adminId
			) {
				//TODO: Remove this line when the cloud version is ready
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

		if (IS_CLOUD) {
			// TODO: mAyBe a rEfaCtoR 🤫
			result = result.filter(
				(provider) => provider.gitProvider.adminId === ctx.user.adminId,
			);
		}
		return result;
	}),

	getBitbucketRepositories: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input, ctx }) => {
			const bitbucketProvider = await findBitbucketById(input.bitbucketId);
			if (
				IS_CLOUD &&
				bitbucketProvider.gitProvider.adminId !== ctx.user.adminId
			) {
				//TODO: Remove this line when the cloud version is ready
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
				IS_CLOUD &&
				bitbucketProvider.gitProvider.adminId !== ctx.user.adminId
			) {
				//TODO: Remove this line when the cloud version is ready
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
					IS_CLOUD &&
					bitbucketProvider.gitProvider.adminId !== ctx.user.adminId
				) {
					//TODO: Remove this line when the cloud version is ready
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
				IS_CLOUD &&
				bitbucketProvider.gitProvider.adminId !== ctx.user.adminId
			) {
				//TODO: Remove this line when the cloud version is ready
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this bitbucket provider",
				});
			}
			return await updateBitbucket(input.bitbucketId, {
				...input,
				adminId: ctx.user.adminId,
			});
		}),
});
