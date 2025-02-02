import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	admins,
	apiCreateDiscord,
	apiCreateEmail,
	apiCreateGotify,
	apiCreateSlack,
	apiCreateTelegram,
	apiFindOneNotification,
	apiTestDiscordConnection,
	apiTestEmailConnection,
	apiTestGotifyConnection,
	apiTestSlackConnection,
	apiTestTelegramConnection,
	apiUpdateDiscord,
	apiUpdateEmail,
	apiUpdateGotify,
	apiUpdateSlack,
	apiUpdateTelegram,
	notifications,
	server,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createDiscordNotification,
	createEmailNotification,
	createGotifyNotification,
	createSlackNotification,
	createTelegramNotification,
	findNotificationById,
	removeNotificationById,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendServerThresholdNotifications,
	sendSlackNotification,
	sendTelegramNotification,
	updateDiscordNotification,
	updateEmailNotification,
	updateGotifyNotification,
	updateSlackNotification,
	updateTelegramNotification,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

// TODO: Uncomment the validations when is cloud ready
export const notificationRouter = createTRPCRouter({
	createSlack: adminProcedure
		.input(apiCreateSlack)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createSlackNotification(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateSlack: adminProcedure
		.input(apiUpdateSlack)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					// TODO: Remove isCloud in the next versions of dokploy
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateSlackNotification({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testSlackConnection: adminProcedure
		.input(apiTestSlackConnection)
		.mutation(async ({ input }) => {
			try {
				await sendSlackNotification(input, {
					channel: input.channel,
					text: "Hi, From Dokploy 👋",
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error testing the notification",
					cause: error,
				});
			}
		}),
	createTelegram: adminProcedure
		.input(apiCreateTelegram)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createTelegramNotification(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),

	updateTelegram: adminProcedure
		.input(apiUpdateTelegram)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					// TODO: Remove isCloud in the next versions of dokploy
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateTelegramNotification({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testTelegramConnection: adminProcedure
		.input(apiTestTelegramConnection)
		.mutation(async ({ input }) => {
			try {
				await sendTelegramNotification(input, "Hi, From Dokploy 👋");
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error testing the notification",
					cause: error,
				});
			}
		}),
	createDiscord: adminProcedure
		.input(apiCreateDiscord)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createDiscordNotification(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),

	updateDiscord: adminProcedure
		.input(apiUpdateDiscord)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					// TODO: Remove isCloud in the next versions of dokploy
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateDiscordNotification({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),

	testDiscordConnection: adminProcedure
		.input(apiTestDiscordConnection)
		.mutation(async ({ input }) => {
			try {
				const decorate = (decoration: string, text: string) =>
					`${input.decoration ? decoration : ""} ${text}`.trim();

				await sendDiscordNotification(input, {
					title: decorate(">", "`🤚` - Test Notification"),
					description: decorate(">", "Hi, From Dokploy 👋"),
					color: 0xf3f7f4,
				});

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error testing the notification",
					cause: error,
				});
			}
		}),
	createEmail: adminProcedure
		.input(apiCreateEmail)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createEmailNotification(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateEmail: adminProcedure
		.input(apiUpdateEmail)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					// TODO: Remove isCloud in the next versions of dokploy
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateEmailNotification({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testEmailConnection: adminProcedure
		.input(apiTestEmailConnection)
		.mutation(async ({ input }) => {
			try {
				await sendEmailNotification(
					input,
					"Test Email",
					"<p>Hi, From Dokploy 👋</p>",
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error testing the notification",
					cause: error,
				});
			}
		}),
	remove: adminProcedure
		.input(apiFindOneNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					// TODO: Remove isCloud in the next versions of dokploy
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this notification",
					});
				}
				return await removeNotificationById(input.notificationId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting this notification",
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneNotification)
		.query(async ({ input, ctx }) => {
			const notification = await findNotificationById(input.notificationId);
			if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
				// TODO: Remove isCloud in the next versions of dokploy
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this notification",
				});
			}
			return notification;
		}),
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.notifications.findMany({
			with: {
				slack: true,
				telegram: true,
				discord: true,
				email: true,
				gotify: true,
			},
			orderBy: desc(notifications.createdAt),
			...(IS_CLOUD && { where: eq(notifications.adminId, ctx.user.adminId) }),
			// TODO: Remove this line when the cloud version is ready
		});
	}),
	receiveNotification: publicProcedure
		.input(
			z.object({
				Type: z.enum(["Memory", "CPU"]),
				Value: z.number(),
				Threshold: z.number(),
				Message: z.string(),
				Timestamp: z.string(),
				Token: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const tokenBuscado = input.Token;
				const result = await db.query.admins.findFirst({
					where: sql`jsonb_extract_path_text(${admins.metricsConfig}::jsonb, 'server', 'token') = ${tokenBuscado}`,
				});
				const adminsConToken = await db
					.select()
					.from(admins)
					.where(
						sql`${admins.metricsConfig}::text LIKE ${`%${tokenBuscado}%`}`,
					);

				console.log(adminsConToken);

				// b843ca953edda562f95e9dafe9c6dd4cf29163533cf5bf344b8f4371436bb979c2478a1b5eecc8f7e450f316231b1d27c9ce0b57c63f283ff992ceaf62558986
				// b843ca953edda562f95e9dafe9c6dd4cf29163533cf5bf344b8f4371436bb979c2478a1b5eecc8f7e450f316231b1d27c9ce0b57c63f283ff992ceaf62558986
				// console.log(adminsConToken);
			} catch (error) {
				// console.log(error);
			}
		}),
	createGotify: adminProcedure
		.input(apiCreateGotify)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createGotifyNotification(input, ctx.user.adminId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateGotify: adminProcedure
		.input(apiUpdateGotify)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (IS_CLOUD && notification.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateGotifyNotification({
					...input,
					adminId: ctx.user.adminId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testGotifyConnection: adminProcedure
		.input(apiTestGotifyConnection)
		.mutation(async ({ input }) => {
			try {
				await sendGotifyNotification(
					input,
					"Test Notification",
					"Hi, From Dokploy 👋",
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error testing the notification",
					cause: error,
				});
			}
		}),
});
