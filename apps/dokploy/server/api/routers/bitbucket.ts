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
	getBitbucketBranches,
	getBitbucketRepositories,
	testBitbucketConnection,
} from "@/server/utils/providers/bitbucket";
import { TRPCError } from "@trpc/server";
import {
	createBitbucket,
	findBitbucketById,
	updateBitbucket,
} from "../services/bitbucket";

export const bitbucketRouter = createTRPCRouter({
	create: protectedProcedure
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
	one: protectedProcedure
		.input(apiFindOneBitbucket)
		.query(async ({ input }) => {
			return await findBitbucketById(input.bitbucketId);
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
	testConnection: protectedProcedure
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
	update: protectedProcedure
		.input(apiUpdateBitbucket)
		.mutation(async ({ input }) => {
			return await updateBitbucket(input.bitbucketId, input);
		}),
});
