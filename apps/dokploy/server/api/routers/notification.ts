import {
  createDiscordNotification,
  createEmailNotification,
  createGotifyNotification,
  createLarkNotification,
  createNtfyNotification,
  createSlackNotification,
  createTelegramNotification,
  findNotificationById,
  getTestNotificationContent,
  IS_CLOUD,
  removeNotificationById,
  sendDiscordNotification,
  sendEmailNotification,
  sendGotifyNotification,
  sendLarkNotification,
  sendNtfyNotification,
  sendServerThresholdNotifications,
  sendSlackNotification,
  sendTelegramNotification,
  updateDiscordNotification,
  updateEmailNotification,
  updateGotifyNotification,
  updateLarkNotification,
  updateNtfyNotification,
  updateSlackNotification,
  updateTelegramNotification,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
  apiCreateDiscord,
  apiCreateEmail,
  apiCreateGotify,
  apiCreateLark,
  apiCreateNtfy,
  apiCreateSlack,
  apiCreateTelegram,
  apiFindOneNotification,
  apiTestDiscordConnection,
  apiTestEmailConnection,
  apiTestGotifyConnection,
  apiTestLarkConnection,
  apiTestNtfyConnection,
  apiTestSlackConnection,
  apiTestTelegramConnection,
  apiUpdateDiscord,
  apiUpdateEmail,
  apiUpdateGotify,
  apiUpdateLark,
  apiUpdateNtfy,
  apiUpdateSlack,
  apiUpdateTelegram,
  notifications,
  server,
  user,
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
        const { notificationTitle, testMessage } = getTestNotificationContent();

        await sendSlackNotification(input, {
          channel: input.channel,
          text: testMessage,
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
        const { testMessage } = getTestNotificationContent();
        await sendTelegramNotification(input, testMessage);
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

        const { discordTitle, testMessage } = getTestNotificationContent();

        await sendDiscordNotification(input, {
          title: decorate(">", discordTitle),
          description: decorate(">", testMessage),
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
        const { emailSubject, emailHtml } = getTestNotificationContent();

        await sendEmailNotification(input, emailSubject, emailHtml);
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
        gotify: true,
        ntfy: true,
        lark: true,
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
          const result = await db
            .select()
            .from(user)
            .where(
              sql`${user.metricsConfig}::jsonb -> 'server' ->> 'token' = ${input.Token}`,
            );

          if (!result?.[0]?.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Token not found",
            });
          }

          organizationId = result?.[0]?.id;
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
        const { notificationTitle, testMessage } = getTestNotificationContent();

        await sendGotifyNotification(input, notificationTitle, testMessage);
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
        const { notificationTitle, ntfyActions, testMessage } =
          getTestNotificationContent();

        await sendNtfyNotification(
          input,
          notificationTitle,
          "",
          ntfyActions,
          testMessage,
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
        const { larkText } = getTestNotificationContent();

        await sendLarkNotification(input, {
          msg_type: "text",
          content: {
            text: larkText,
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
  getEmailProviders: adminProcedure.query(async ({ ctx }) => {
    return await db.query.notifications.findMany({
      where: eq(notifications.organizationId, ctx.session.activeOrganizationId),
      with: {
        email: true,
      },
    });
  }),
});
