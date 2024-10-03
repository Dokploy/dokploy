import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiFindOneDestination,
	apiRemoveDestination,
	apiUpdateDestination,
} from "@/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	execAsync,
	findAdmin,
	createDestintation,
	findDestinationById,
	removeDestinationById,
	updateDestinationById,
} from "@dokploy/builders";

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

			try {
				const rcloneFlags = [
					// `--s3-provider=Cloudflare`,
					`--s3-access-key-id=${accessKey}`,
					`--s3-secret-access-key=${secretAccessKey}`,
					`--s3-region=${region}`,
					`--s3-endpoint=${endpoint}`,
					"--s3-no-check-bucket",
					"--s3-force-path-style",
				];
				const rcloneDestination = `:s3:${bucket}`;
				const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;
				await execAsync(rcloneCommand);
			} catch (error) {
				console.log(error);
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
	all: protectedProcedure.query(async () => {
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
