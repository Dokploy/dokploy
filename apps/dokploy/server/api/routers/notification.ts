import {
	createCustomNotification,
	createDiscordNotification,
	createEmailNotification,
	createGotifyNotification,
	createLarkNotification,
	createNtfyNotification,
	createPushoverNotification,
	createResendNotification,
	createSlackNotification,
	createTeamsNotification,
	createTelegramNotification,
	findNotificationById,
	getWebServerSettings,
	IS_CLOUD,
	removeNotificationById,
	sendCustomNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendLarkNotification,
	sendNtfyNotification,
	sendPushoverNotification,
	sendResendNotification,
	sendServerThresholdNotifications,
	sendSlackNotification,
	sendTeamsNotification,
	sendTelegramNotification,
	updateCustomNotification,
	updateDiscordNotification,
	updateEmailNotification,
	updateGotifyNotification,
	updateLarkNotification,
	updateNtfyNotification,
	updatePushoverNotification,
	updateResendNotification,
	updateSlackNotification,
	updateTeamsNotification,
	updateTelegramNotification,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import {
	apiCreateCustom,
	apiCreateDiscord,
	apiCreateEmail,
	apiCreateGotify,
	apiCreateLark,
	apiCreateNtfy,
	apiCreatePushover,
	apiCreateResend,
	apiCreateSlack,
	apiCreateTeams,
	apiCreateTelegram,
	apiFindOneNotification,
	apiTestCustomConnection,
	apiTestDiscordConnection,
	apiTestEmailConnection,
	apiTestGotifyConnection,
	apiTestLarkConnection,
	apiTestNtfyConnection,
	apiTestPushoverConnection,
	apiTestResendConnection,
	apiTestSlackConnection,
	apiTestTeamsConnection,
	apiTestTelegramConnection,
	apiUpdateCustom,
	apiUpdateDiscord,
	apiUpdateEmail,
	apiUpdateGotify,
	apiUpdateLark,
	apiUpdateNtfy,
	apiUpdatePushover,
	apiUpdateResend,
	apiUpdateSlack,
	apiUpdateTeams,
	apiUpdateTelegram,
	notifications,
	server,
} from "@/server/db/schema";

export const notificationRouter = createTRPCRouter({
	createSlack: adminProcedure
		.input(apiCreateSlack)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createSlackNotification(
					input,
					ctx.session.activeOrganizationId,
				);
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
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateSlackNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
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
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	createTelegram: adminProcedure
		.input(apiCreateTelegram)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createTelegramNotification(
					input,
					ctx.session.activeOrganizationId,
				);
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
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateTelegramNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
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
				return await createDiscordNotification(
					input,
					ctx.session.activeOrganizationId,
				);
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
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateDiscordNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
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
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	createEmail: adminProcedure
		.input(apiCreateEmail)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createEmailNotification(
					input,
					ctx.session.activeOrganizationId,
				);
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
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateEmailNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
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
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	createResend: adminProcedure
		.input(apiCreateResend)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createResendNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateResend: adminProcedure
		.input(apiUpdateResend)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateResendNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testResendConnection: adminProcedure
		.input(apiTestResendConnection)
		.mutation(async ({ input }) => {
			try {
				await sendResendNotification(
					input,
					"Test Email",
					"<p>Hi, From Dokploy 👋</p>",
				);
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	remove: adminProcedure
		.input(apiFindOneNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this notification",
					});
				}
				return await removeNotificationById(input.notificationId);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Error deleting this notification";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	one: protectedProcedure
		.input(apiFindOneNotification)
		.query(async ({ input, ctx }) => {
			const notification = await findNotificationById(input.notificationId);
			if (notification.organizationId !== ctx.session.activeOrganizationId) {
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
				resend: true,
				gotify: true,
				ntfy: true,
				custom: true,
				lark: true,
				pushover: true,
				teams: true,
			},
			orderBy: desc(notifications.createdAt),
			where: eq(notifications.organizationId, ctx.session.activeOrganizationId),
		});
	}),
	receiveNotification: publicProcedure
		.input(
			z.object({
				ServerType: z.enum(["Dokploy", "Remote"]).default("Dokploy"),
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
				let organizationId = "";
				let ServerName = "";
				if (input.ServerType === "Dokploy") {
					const settings = await getWebServerSettings();
					if (
						!settings?.metricsConfig?.server?.token ||
						settings.metricsConfig.server.token !== input.Token
					) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Token not found",
						});
					}

					// For Dokploy server type, we don't have a specific organizationId
					// This might need to be adjusted based on your business logic
					organizationId = "";
					ServerName = "Dokploy";
				} else {
					const result = await db
						.select()
						.from(server)
						.where(
							sql`${server.metricsConfig}::jsonb -> 'server' ->> 'token' = ${input.Token}`,
						);

					if (!result?.[0]?.organizationId) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Token not found",
						});
					}

					organizationId = result?.[0]?.organizationId;
					ServerName = "Remote";
				}

				await sendServerThresholdNotifications(organizationId, {
					...input,
					ServerName,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error sending the notification",
					cause: error,
				});
			}
		}),
	createGotify: adminProcedure
		.input(apiCreateGotify)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createGotifyNotification(
					input,
					ctx.session.activeOrganizationId,
				);
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
				if (
					IS_CLOUD &&
					notification.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateGotifyNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
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
	createNtfy: adminProcedure
		.input(apiCreateNtfy)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createNtfyNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateNtfy: adminProcedure
		.input(apiUpdateNtfy)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (
					IS_CLOUD &&
					notification.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateNtfyNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testNtfyConnection: adminProcedure
		.input(apiTestNtfyConnection)
		.mutation(async ({ input }) => {
			try {
				await sendNtfyNotification(
					input,
					"Test Notification",
					"",
					"view, visit Dokploy on Github, https://github.com/dokploy/dokploy, clear=true;",
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
	createCustom: adminProcedure
		.input(apiCreateCustom)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createCustomNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateCustom: adminProcedure
		.input(apiUpdateCustom)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateCustomNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testCustomConnection: adminProcedure
		.input(apiTestCustomConnection)
		.mutation(async ({ input }) => {
			try {
				await sendCustomNotification(input, {
					title: "Test Notification",
					message: "Hi, From Dokploy 👋",
					timestamp: new Date().toISOString(),
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	createLark: adminProcedure
		.input(apiCreateLark)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createLarkNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateLark: adminProcedure
		.input(apiUpdateLark)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (
					IS_CLOUD &&
					notification.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateLarkNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testLarkConnection: adminProcedure
		.input(apiTestLarkConnection)
		.mutation(async ({ input }) => {
			try {
				await sendLarkNotification(input, {
					msg_type: "text",
					content: {
						text: "Hi, From Dokploy 👋",
					},
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
	createTeams: adminProcedure
		.input(apiCreateTeams)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createTeamsNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateTeams: adminProcedure
		.input(apiUpdateTeams)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (
					IS_CLOUD &&
					notification.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updateTeamsNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testTeamsConnection: adminProcedure
		.input(apiTestTeamsConnection)
		.mutation(async ({ input }) => {
			try {
				await sendTeamsNotification(input, {
					title: "🤚 Test Notification",
					facts: [{ name: "Message", value: "Hi, From Dokploy 👋" }],
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
					cause: error,
				});
			}
		}),
	createPushover: adminProcedure
		.input(apiCreatePushover)
		.mutation(async ({ input, ctx }) => {
			try {
				return await createPushoverNotification(
					input,
					ctx.session.activeOrganizationId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updatePushover: adminProcedure
		.input(apiUpdatePushover)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (
					IS_CLOUD &&
					notification.organizationId !== ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this notification",
					});
				}
				return await updatePushoverNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
			} catch (error) {
				throw error;
			}
		}),
	testPushoverConnection: adminProcedure
		.input(apiTestPushoverConnection)
		.mutation(async ({ input }) => {
			try {
				await sendPushoverNotification(
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
	getEmailProviders: adminProcedure.query(async ({ ctx }) => {
		return await db.query.notifications.findMany({
			where: eq(notifications.organizationId, ctx.session.activeOrganizationId),
			with: {
				email: true,
				resend: true,
			},
		});
	}),
});
