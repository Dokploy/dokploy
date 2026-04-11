import {
	createCustomNotification,
	createDiscordNotification,
	createEmailNotification,
	createGotifyNotification,
	createLarkNotification,
	createMattermostNotification,
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
	sendMattermostNotification,
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
	updateMattermostNotification,
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
	createTRPCRouter,
	publicProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateCustom,
	apiCreateDiscord,
	apiCreateEmail,
	apiCreateGotify,
	apiCreateLark,
	apiCreateMattermost,
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
	apiTestMattermostConnection,
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
	apiUpdateMattermost,
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
	createSlack: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Slack notification",
				description: "Creates a new Slack notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateSlack)
		.mutation(async ({ input, ctx }) => {
			try {
				await createSlackNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				console.log(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateSlack: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Slack notification",
				description: "Updates an existing Slack notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateSlackNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testSlackConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Slack connection",
				description: "Sends a test message to the configured Slack channel to verify the webhook connection works.",
			},
		})
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
	createTelegram: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Telegram notification",
				description: "Creates a new Telegram notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateTelegram)
		.mutation(async ({ input, ctx }) => {
			try {
				await createTelegramNotification(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),

	updateTelegram: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Telegram notification",
				description: "Updates an existing Telegram notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateTelegramNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testTelegramConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Telegram connection",
				description: "Sends a test message to the configured Telegram chat to verify the bot token and chat ID work.",
			},
		})
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
	createDiscord: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Discord notification",
				description: "Creates a new Discord notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateDiscord)
		.mutation(async ({ input, ctx }) => {
			try {
				await createDiscordNotification(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),

	updateDiscord: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Discord notification",
				description: "Updates an existing Discord notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateDiscordNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),

	testDiscordConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Discord connection",
				description: "Sends a test embed message to the configured Discord webhook to verify the connection works.",
			},
		})
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
	createEmail: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Email notification",
				description: "Creates a new SMTP email notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateEmail)
		.mutation(async ({ input, ctx }) => {
			try {
				await createEmailNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateEmail: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Email notification",
				description: "Updates an existing SMTP email notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateEmailNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testEmailConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Email connection",
				description: "Sends a test email via the configured SMTP settings to verify the connection works.",
			},
		})
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
	createResend: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Resend notification",
				description: "Creates a new Resend email notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateResend)
		.mutation(async ({ input, ctx }) => {
			try {
				await createResendNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateResend: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Resend notification",
				description: "Updates an existing Resend email notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateResendNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the notification",
					cause: error,
				});
			}
		}),
	testResendConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Resend connection",
				description: "Sends a test email via Resend to verify the API key and configuration work.",
			},
		})
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
	remove: withPermission("notification", "delete")
		.meta({
			openapi: {
				summary: "Delete notification",
				description: "Removes a notification provider by ID. Verifies organization ownership and logs an audit event before deletion.",
			},
		})
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
				await audit(ctx, {
					action: "delete",
					resourceType: "notification",
					resourceName: notification.name,
				});
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
	one: withPermission("notification", "read")
		.meta({
			openapi: {
				summary: "Get notification",
				description: "Returns a single notification provider by ID. Verifies the caller belongs to the same organization.",
			},
		})
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
	all: withPermission("notification", "read")
		.meta({
			openapi: {
				summary: "List all notifications",
				description: "Returns all notification providers for the current organization, including all provider-specific details (Slack, Telegram, Discord, etc.).",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.notifications.findMany({
			with: {
				slack: true,
				telegram: true,
				discord: true,
				email: true,
				resend: true,
				gotify: true,
				ntfy: true,
				mattermost: true,
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
		.meta({
			openapi: {
				summary: "Receive server threshold notification",
				description: "Public endpoint that receives CPU/memory threshold alerts from Dokploy or remote servers. Validates the token and dispatches notifications to all configured providers.",
			},
		})
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
	createGotify: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Gotify notification",
				description: "Creates a new Gotify notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateGotify)
		.mutation(async ({ input, ctx }) => {
			try {
				await createGotifyNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateGotify: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Gotify notification",
				description: "Updates an existing Gotify notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateGotifyNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testGotifyConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Gotify connection",
				description: "Sends a test notification to the configured Gotify server to verify the connection works.",
			},
		})
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
	createNtfy: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create ntfy notification",
				description: "Creates a new ntfy notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateNtfy)
		.mutation(async ({ input, ctx }) => {
			try {
				await createNtfyNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateNtfy: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update ntfy notification",
				description: "Updates an existing ntfy notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateNtfyNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testNtfyConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test ntfy connection",
				description: "Sends a test notification to the configured ntfy topic to verify the connection works.",
			},
		})
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
					message:
						error instanceof Error
							? `Error testing the notification: ${error.message}`
							: "Error testing the notification",
					cause: error,
				});
			}
		}),
	createMattermost: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Mattermost notification",
				description: "Creates a new Mattermost notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateMattermost)
		.mutation(async ({ input, ctx }) => {
			try {
				await createMattermostNotification(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateMattermost: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Mattermost notification",
				description: "Updates an existing Mattermost notification provider. Verifies organization ownership before applying changes.",
			},
		})
		.input(apiUpdateMattermost)
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
				const result = await updateMattermostNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testMattermostConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Mattermost connection",
				description: "Sends a test message to the configured Mattermost webhook to verify the connection works.",
			},
		})
		.input(apiTestMattermostConnection)
		.mutation(async ({ input }) => {
			try {
				await sendMattermostNotification(input, {
					text: "Hi, From Dokploy 👋",
					channel: input.channel,
					username: input.username || "Dokploy Bot",
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
	createCustom: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create custom webhook notification",
				description: "Creates a new custom webhook notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateCustom)
		.mutation(async ({ input, ctx }) => {
			try {
				await createCustomNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateCustom: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update custom webhook notification",
				description: "Updates an existing custom webhook notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateCustomNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testCustomConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test custom webhook connection",
				description: "Sends a test payload to the configured custom webhook URL to verify the connection works.",
			},
		})
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
	createLark: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Lark notification",
				description: "Creates a new Lark notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateLark)
		.mutation(async ({ input, ctx }) => {
			try {
				await createLarkNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateLark: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Lark notification",
				description: "Updates an existing Lark notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateLarkNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testLarkConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Lark connection",
				description: "Sends a test message to the configured Lark webhook to verify the connection works.",
			},
		})
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
	createTeams: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Teams notification",
				description: "Creates a new Microsoft Teams notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreateTeams)
		.mutation(async ({ input, ctx }) => {
			try {
				await createTeamsNotification(input, ctx.session.activeOrganizationId);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updateTeams: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Teams notification",
				description: "Updates an existing Microsoft Teams notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updateTeamsNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testTeamsConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Teams connection",
				description: "Sends a test message to the configured Microsoft Teams webhook to verify the connection works.",
			},
		})
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
	createPushover: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Create Pushover notification",
				description: "Creates a new Pushover notification provider for the current organization and logs an audit event.",
			},
		})
		.input(apiCreatePushover)
		.mutation(async ({ input, ctx }) => {
			try {
				await createPushoverNotification(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "notification",
					resourceName: input.name,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the notification",
					cause: error,
				});
			}
		}),
	updatePushover: withPermission("notification", "update")
		.meta({
			openapi: {
				summary: "Update Pushover notification",
				description: "Updates an existing Pushover notification provider. Verifies organization ownership before applying changes.",
			},
		})
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
				const result = await updatePushoverNotification({
					...input,
					organizationId: ctx.session.activeOrganizationId,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "notification",
					resourceId: input.notificationId,
					resourceName: notification.name,
				});
				return result;
			} catch (error) {
				throw error;
			}
		}),
	testPushoverConnection: withPermission("notification", "create")
		.meta({
			openapi: {
				summary: "Test Pushover connection",
				description: "Sends a test notification to the configured Pushover account to verify the connection works.",
			},
		})
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
	getEmailProviders: withPermission("notification", "read")
		.meta({
			openapi: {
				summary: "List email notification providers",
				description: "Returns all notification providers that support email (SMTP and Resend) for the current organization.",
			},
		})
		.query(
		async ({ ctx }) => {
			return await db.query.notifications.findMany({
				where: eq(
					notifications.organizationId,
					ctx.session.activeOrganizationId,
				),
				with: {
					email: true,
					resend: true,
				},
			});
		},
	),
});
