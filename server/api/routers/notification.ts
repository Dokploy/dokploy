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
	apiSendTest,
	apiUpdateDestination,
} from "@/server/db/schema";
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
import nodemailer from "nodemailer";

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
	testConnection: adminProcedure
		.input(apiSendTest)
		.mutation(async ({ input }) => {
			const notificationType = input.notificationType;
			console.log(input);

			if (notificationType === "slack") {
				// go to your slack dashboard
				// go to integrations
				// add a new integration
				// select incoming webhook
				// copy the webhook url
				console.log("test slack");
				const { webhookUrl, channel } = input;
				try {
					const response = await fetch(webhookUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ text: "Test notification", channel }),
					});
				} catch (err) {
					console.log(err);
				}
			} else if (notificationType === "telegram") {
				// start telegram
				// search BotFather
				// send /newbot
				// name
				// name-with-bot-at-the-end
				// copy the token
				// search @userinfobot
				// send /start
				// copy the Id
				const { botToken, chatId } = input;
				try {
					const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
					const response = await fetch(url, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							chat_id: chatId,
							text: "Test notification",
						}),
					});

					if (!response.ok) {
						throw new Error(
							`Error sending Telegram notification: ${response.statusText}`,
						);
					}

					console.log("Telegram notification sent successfully");
				} catch (error) {
					console.error("Error sending Telegram notification:", error);
					throw new Error("Error sending Telegram notification");
				}
			} else if (notificationType === "discord") {
				const { webhookUrl } = input;
				try {
					// go to your discord server
					// go to settings
					// go to integrations
					// add a new integration
					// select webhook
					// copy the webhook url
					const response = await fetch(webhookUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							content: "Test notification",
						}),
					});

					if (!response.ok) {
						throw new Error(
							`Error sending Discord notification: ${response.statusText}`,
						);
					}

					console.log("Discord notification sent successfully");
				} catch (error) {
					console.error("Error sending Discord notification:", error);
					throw new Error("Error sending Discord notification");
				}
			} else if (notificationType === "email") {
				const { smtpServer, smtpPort, username, password, toAddresses } = input;
				try {
					const transporter = nodemailer.createTransport({
						host: smtpServer,
						port: smtpPort,
						secure: smtpPort === "465",
						auth: {
							user: username,
							pass: password,
						},
					});
					// need to add a valid from address
					const fromAddress = "no-reply@emails.dokploy.com";
					const mailOptions = {
						from: fromAddress,
						to: toAddresses?.join(", "),
						subject: "Test email",
						text: "Test email",
					};

					await transporter.sendMail(mailOptions);

					console.log("Email notification sent successfully");
				} catch (error) {
					console.error("Error sending Email notification:", error);
					throw new Error("Error sending Email notification");
				}
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
