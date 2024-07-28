import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@dokploy/server/api/trpc";
import { db } from "@dokploy/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { findAdmin } from "../services/admin";
import {
	createDestintation,
	findDestinationById,
	removeDestinationById,
	updateDestinationById,
} from "../services/destination";

export const destinationRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			try {
				await createDestintation(input);
				return await findAdmin();
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiCreateDestination)
		.mutation(async ({ input }) => {
			const { secretAccessKey, bucket, region, endpoint, accessKey } = input;
			const s3Client = new S3Client({
				region: region,
				...(endpoint && {
					endpoint: endpoint,
				}),
				credentials: {
					accessKeyId: accessKey,
					secretAccessKey: secretAccessKey,
				},
				forcePathStyle: true,
			});
			const headBucketCommand = new HeadBucketCommand({ Bucket: bucket });

			try {
				await s3Client.send(headBucketCommand);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to connect to bucket",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneDestination)
		.query(async ({ input }) => {
			const destination = await findDestinationById(input.destinationId);
			return destination;
		}),
	all: adminProcedure.query(async () => {
		return await db.query.destinations.findMany({});
	}),
	remove: adminProcedure
		.input(apiRemoveDestination)
		.mutation(async ({ input }) => {
			try {
				return await removeDestinationById(input.destinationId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this destination",
				});
			}
		}),
	update: adminProcedure
		.input(apiUpdateDestination)
		.mutation(async ({ input }) => {
			try {
				return await updateDestinationById(input.destinationId, input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update this destination",
					cause: error,
				});
			}
		}),
});
