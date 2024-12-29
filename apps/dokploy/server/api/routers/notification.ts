import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateDiscord,
	apiCreateEmail,
	apiCreateSlack,
	apiCreateTelegram,
	apiFindOneNotification,
	apiTestDiscordConnection,
	apiTestEmailConnection,
	apiTestSlackConnection,
	apiTestTelegramConnection,
	apiUpdateDiscord,
	apiUpdateEmail,
	apiUpdateSlack,
	apiUpdateTelegram,
	notifications,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createDiscordNotification,
	createEmailNotification,
	createSlackNotification,
	createTelegramNotification,
	findNotificationById,
	removeNotificationById,
	sendDiscordNotification,
	sendEmailNotification,
	sendSlackNotification,
	sendTelegramNotification,
	updateDiscordNotification,
	updateEmailNotification,
	updateSlackNotification,
	updateTelegramNotification,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

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
			},
			orderBy: desc(notifications.createdAt),
			...(IS_CLOUD && { where: eq(notifications.adminId, ctx.user.adminId) }),
			// TODO: Remove this line when the cloud version is ready
		});
	}),
});
