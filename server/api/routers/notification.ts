import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDestination,
	apiCreateDiscord,
	apiCreateEmail,
	apiCreateSlack,
	apiCreateTelegram,
	apiFindOneNotification,
	apiUpdateDestination,
} from "@/server/db/schema";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { TRPCError } from "@trpc/server";
import { updateDestinationById } from "../services/destination";
import {
	createDiscordNotification,
	createEmailNotification,
	createSlackNotification,
	createTelegramNotification,
	findNotificationById,
	removeNotificationById,
} from "../services/notification";

export const notificationRouter = createTRPCRouter({
	createSlack: adminProcedure
		.input(apiCreateSlack)
		.mutation(async ({ input }) => {
			try {
				return await createSlackNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	createTelegram: adminProcedure
		.input(apiCreateTelegram)
		.mutation(async ({ input }) => {
			try {
				return await createTelegramNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	createDiscord: adminProcedure
		.input(apiCreateDiscord)
		.mutation(async ({ input }) => {
			try {
				return await createDiscordNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	createEmail: adminProcedure
		.input(apiCreateEmail)
		.mutation(async ({ input }) => {
			try {
				return await createEmailNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the destination",
					cause: error,
				});
			}
		}),
	removeNotification: adminProcedure
		.input(apiFindOneNotification)
		.mutation(async ({ input }) => {
			try {
				return await removeNotificationById(input.notificationId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this notification",
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneNotification)
		.query(async ({ input }) => {
			const notification = await findNotificationById(input.notificationId);
			return notification;
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

	all: adminProcedure.query(async () => {
		return await db.query.notifications.findMany({
			with: {
				slack: true,
				telegram: true,
				discord: true,
				email: true,
			},
		});
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
