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
import { TRPCError } from "@trpc/server";
import {
	createDiscordNotification,
	createEmailNotification,
	createSlackNotification,
	createTelegramNotification,
	findNotificationById,
	removeNotificationById,
	sendDiscordTestNotification,
	sendEmailTestNotification,
	sendSlackTestNotification,
	sendTelegramTestNotification,
	updateDiscordNotification,
	updateEmailNotification,
	updateSlackNotification,
	updateTelegramNotification,
} from "../services/notification";
import { desc } from "drizzle-orm";

export const notificationRouter = createTRPCRouter({
	createSlack: adminProcedure
		.input(apiCreateSlack)
		.mutation(async ({ input }) => {
			try {
				return await createSlackNotification(input);
			} catch (error) {
				console.log(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the notification",
					cause: error,
				});
			}
		}),
	updateSlack: adminProcedure
		.input(apiUpdateSlack)
		.mutation(async ({ input }) => {
			try {
				return await updateSlackNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update the notification",
					cause: error,
				});
			}
		}),
	testSlackConnection: adminProcedure
		.input(apiTestSlackConnection)
		.mutation(async ({ input }) => {
			try {
				await sendSlackTestNotification(input);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to test the notification",
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
					message: "Error to create the notification",
					cause: error,
				});
			}
		}),

	updateTelegram: adminProcedure
		.input(apiUpdateTelegram)
		.mutation(async ({ input }) => {
			try {
				return await updateTelegramNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update the notification",
					cause: error,
				});
			}
		}),
	testTelegramConnection: adminProcedure
		.input(apiTestTelegramConnection)
		.mutation(async ({ input }) => {
			try {
				await sendTelegramTestNotification(input);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to test the notification",
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
					message: "Error to create the notification",
					cause: error,
				});
			}
		}),

	updateDiscord: adminProcedure
		.input(apiUpdateDiscord)
		.mutation(async ({ input }) => {
			try {
				return await updateDiscordNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update the notification",
					cause: error,
				});
			}
		}),

	testDiscordConnection: adminProcedure
		.input(apiTestDiscordConnection)
		.mutation(async ({ input }) => {
			try {
				await sendDiscordTestNotification(input);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to test the notification",
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
				console.log(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the notification",
					cause: error,
				});
			}
		}),
	updateEmail: adminProcedure
		.input(apiUpdateEmail)
		.mutation(async ({ input }) => {
			try {
				return await updateEmailNotification(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update the notification",
					cause: error,
				});
			}
		}),
	testEmailConnection: adminProcedure
		.input(apiTestEmailConnection)
		.mutation(async ({ input }) => {
			try {
				await sendEmailTestNotification(input);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to test the notification",
					cause: error,
				});
			}
		}),
	remove: adminProcedure
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
	all: adminProcedure.query(async () => {
		return await db.query.notifications.findMany({
			with: {
				slack: true,
				telegram: true,
				discord: true,
				email: true,
			},
			orderBy: desc(notifications.createdAt),
		});
	}),
});
