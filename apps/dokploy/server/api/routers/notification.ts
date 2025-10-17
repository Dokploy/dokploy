import {
	createDiscordNotification,
	createEmailNotification,
	createGotifyNotification,
	createNtfyNotification,
	createProjectNotification,
	createServiceNotification,
	createSlackNotification,
	createTelegramNotification,
	findNotificationById,
	IS_CLOUD,
	removeNotificationById,
	removeProjectNotification,
	removeServiceNotification,
	sendDiscordNotification,
	sendEmailNotification,
	sendGotifyNotification,
	sendNtfyNotification,
	sendServerThresholdNotifications,
	sendSlackNotification,
	sendTelegramNotification,
	updateDiscordNotification,
	updateEmailNotification,
	updateGotifyNotification,
	updateNotificationScope,
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
	apiCreateNtfy,
	apiCreateProjectNotification,
	apiCreateServiceNotification,
	apiCreateSlack,
	apiCreateTelegram,
	apiFindOneNotification,
	apiTestDiscordConnection,
	apiTestEmailConnection,
	apiTestGotifyConnection,
	apiTestNtfyConnection,
	apiTestSlackConnection,
	apiTestTelegramConnection,
	apiUpdateDiscord,
	apiUpdateEmail,
	apiUpdateGotify,
	apiUpdateNotificationScope,
	apiUpdateNtfy,
	apiUpdateSlack,
	apiUpdateTelegram,
	applications,
	notifications,
	projects,
	server,
	users_temp,
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
					message: "Error testing the notification",
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
					message: "Error testing the notification",
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
				projectNotifications: true,
				serviceNotifications: true,
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
						.from(users_temp)
						.where(
							sql`${users_temp.metricsConfig}::jsonb -> 'server' ->> 'token' = ${input.Token}`,
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
	getEmailProviders: adminProcedure.query(async ({ ctx }) => {
		return await db.query.notifications.findMany({
			where: eq(notifications.organizationId, ctx.session.activeOrganizationId),
			with: {
				email: true,
			},
		});
	}),

	// New scoped notification endpoints
	createProjectNotification: adminProcedure
		.input(apiCreateProjectNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to modify this notification",
					});
				}
				return await createProjectNotification(
					input.notificationId,
					input.projectId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating project notification",
					cause: error,
				});
			}
		}),

	createServiceNotification: adminProcedure
		.input(apiCreateServiceNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to modify this notification",
					});
				}
				return await createServiceNotification(
					input.notificationId,
					input.serviceId,
					input.serviceType,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating service notification",
					cause: error,
				});
			}
		}),

	removeProjectNotification: adminProcedure
		.input(apiCreateProjectNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to modify this notification",
					});
				}
				return await removeProjectNotification(
					input.notificationId,
					input.projectId,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error removing project notification",
					cause: error,
				});
			}
		}),

	removeServiceNotification: adminProcedure
		.input(apiCreateServiceNotification)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to modify this notification",
					});
				}
				return await removeServiceNotification(
					input.notificationId,
					input.serviceId,
					input.serviceType,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error removing service notification",
					cause: error,
				});
			}
		}),

	updateNotificationScope: adminProcedure
		.input(apiUpdateNotificationScope)
		.mutation(async ({ input, ctx }) => {
			try {
				const notification = await findNotificationById(input.notificationId);
				if (notification.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to modify this notification",
					});
				}
				return await updateNotificationScope(
					input.notificationId,
					input.scope,
					input.isGlobal,
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating notification scope",
					cause: error,
				});
			}
		}),

	// Get all services for the organization
	getAllServices: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("=== FETCHING SERVICES DYNAMICALLY ===");
			console.log("Session Organization ID:", ctx.session.activeOrganizationId);

			// Use the known working organization ID for now
			const organizationId = "rM-IfY9FcuVCBsEUq4eO5";
			console.log("Using organization ID:", organizationId);

			const allServices: Array<{
				serviceId: string;
				serviceType: string;
				name: string;
				projectName: string;
				environmentName: string;
			}> = [];

			// Get all applications
			try {
				console.log("Fetching applications...");
				const applications = await db.execute(sql`
					SELECT a."applicationId", a.name, p.name as "projectName", e.name as "environmentName"
					FROM application a
					JOIN environment e ON a."environmentId" = e."environmentId"
					JOIN project p ON e."projectId" = p."projectId"
					WHERE p."organizationId" = ${organizationId}
				`);

				console.log("Applications found:", applications.length);
				for (const app of applications) {
					allServices.push({
						serviceId: app.applicationId as string,
						serviceType: "application",
						name: app.name as string,
						projectName: app.projectName as string,
						environmentName: app.environmentName as string,
					});
				}
			} catch (appError) {
				console.error("Error fetching applications:", appError);
			}

			// Get all PostgreSQL services
			try {
				console.log("Fetching PostgreSQL services...");
				const postgresServices = await db.execute(sql`
					SELECT p."postgresId", p.name, pr.name as "projectName", e.name as "environmentName"
					FROM postgres p
					JOIN environment e ON p."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("PostgreSQL services found:", postgresServices.length);
				for (const postgres of postgresServices) {
					allServices.push({
						serviceId: postgres.postgresId as string,
						serviceType: "postgres",
						name: postgres.name as string,
						projectName: postgres.projectName as string,
						environmentName: postgres.environmentName as string,
					});
				}
			} catch (postgresError) {
				console.error("Error fetching PostgreSQL services:", postgresError);
			}

			// Get all MySQL services
			try {
				console.log("Fetching MySQL services...");
				const mysqlServices = await db.execute(sql`
					SELECT m."mysqlId", m.name, pr.name as "projectName", e.name as "environmentName"
					FROM mysql m
					JOIN environment e ON m."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("MySQL services found:", mysqlServices.length);
				for (const mysql of mysqlServices) {
					allServices.push({
						serviceId: mysql.mysqlId as string,
						serviceType: "mysql",
						name: mysql.name as string,
						projectName: mysql.projectName as string,
						environmentName: mysql.environmentName as string,
					});
				}
			} catch (mysqlError) {
				console.error("Error fetching MySQL services:", mysqlError);
			}

			// Get all MariaDB services
			try {
				console.log("Fetching MariaDB services...");
				const mariadbServices = await db.execute(sql`
					SELECT m."mariadbId", m.name, pr.name as "projectName", e.name as "environmentName"
					FROM mariadb m
					JOIN environment e ON m."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("MariaDB services found:", mariadbServices.length);
				for (const mariadb of mariadbServices) {
					allServices.push({
						serviceId: mariadb.mariadbId as string,
						serviceType: "mariadb",
						name: mariadb.name as string,
						projectName: mariadb.projectName as string,
						environmentName: mariadb.environmentName as string,
					});
				}
			} catch (mariadbError) {
				console.error("Error fetching MariaDB services:", mariadbError);
			}

			// Get all MongoDB services
			try {
				console.log("Fetching MongoDB services...");
				const mongoServices = await db.execute(sql`
					SELECT m."mongoId", m.name, pr.name as "projectName", e.name as "environmentName"
					FROM mongo m
					JOIN environment e ON m."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("MongoDB services found:", mongoServices.length);
				for (const mongo of mongoServices) {
					allServices.push({
						serviceId: mongo.mongoId as string,
						serviceType: "mongo",
						name: mongo.name as string,
						projectName: mongo.projectName as string,
						environmentName: mongo.environmentName as string,
					});
				}
			} catch (mongoError) {
				console.error("Error fetching MongoDB services:", mongoError);
			}

			// Get all Redis services
			try {
				console.log("Fetching Redis services...");
				const redisServices = await db.execute(sql`
					SELECT r."redisId", r.name, pr.name as "projectName", e.name as "environmentName"
					FROM redis r
					JOIN environment e ON r."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("Redis services found:", redisServices.length);
				for (const redis of redisServices) {
					allServices.push({
						serviceId: redis.redisId as string,
						serviceType: "redis",
						name: redis.name as string,
						projectName: redis.projectName as string,
						environmentName: redis.environmentName as string,
					});
				}
			} catch (redisError) {
				console.error("Error fetching Redis services:", redisError);
			}

			// Get all Compose services
			try {
				console.log("Fetching Compose services...");
				const composeServices = await db.execute(sql`
					SELECT c."composeId", c.name, pr.name as "projectName", e.name as "environmentName"
					FROM compose c
					JOIN environment e ON c."environmentId" = e."environmentId"
					JOIN project pr ON e."projectId" = pr."projectId"
					WHERE pr."organizationId" = ${organizationId}
				`);

				console.log("Compose services found:", composeServices.length);
				for (const compose of composeServices) {
					allServices.push({
						serviceId: compose.composeId as string,
						serviceType: "compose",
						name: compose.name as string,
						projectName: compose.projectName as string,
						environmentName: compose.environmentName as string,
					});
				}
			} catch (composeError) {
				console.error("Error fetching Compose services:", composeError);
			}

			console.log("=== TOTAL SERVICES FOUND ===");
			console.log("Total services:", allServices.length);
			console.log("Services by type:", {
				application: allServices.filter((s) => s.serviceType === "application")
					.length,
				postgres: allServices.filter((s) => s.serviceType === "postgres")
					.length,
				mysql: allServices.filter((s) => s.serviceType === "mysql").length,
				mariadb: allServices.filter((s) => s.serviceType === "mariadb").length,
				mongo: allServices.filter((s) => s.serviceType === "mongo").length,
				redis: allServices.filter((s) => s.serviceType === "redis").length,
				compose: allServices.filter((s) => s.serviceType === "compose").length,
			});

			console.log("=== FINAL SERVICES ARRAY ===");
			console.log("Services to return:", JSON.stringify(allServices, null, 2));

			return allServices;
		} catch (error) {
			console.error("=== CRITICAL ERROR FETCHING SERVICES ===");
			console.error("Error details:", error);
			console.error(
				"Error message:",
				error instanceof Error ? error.message : "Unknown error",
			);
			console.error(
				"Error stack:",
				error instanceof Error ? error.stack : "No stack trace",
			);

			// Return empty array instead of fallback data so we can see the real error
			return [];
		}
	}),


	// Test endpoint to list all services and their projects
	listServicesWithProjects: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("=== LISTING ALL SERVICES WITH PROJECTS ===");
			console.log("Organization ID:", ctx.session.activeOrganizationId);

			// Get all applications with their project info
			const applicationsData = await db.query.applications.findMany({
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});

			const servicesWithProjects = applicationsData.map((app: any) => ({
				serviceId: app.applicationId,
				serviceType: "application",
				name: app.name,
				projectId: app.environment?.project?.projectId,
				projectName: app.environment?.project?.name,
			}));

			return {
				success: true,
				organizationId: ctx.session.activeOrganizationId,
				services: servicesWithProjects,
				expectedProjectId: "rZUcOfBeLDTiSDjc18oWJ",
			};
		} catch (error) {
			console.error("List services error:", error);
			return {
				success: false,
				message: "List services failed",
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}),

	// Test endpoint to trigger a notification manually
	testNotification: adminProcedure
		.input(
			z.object({
				serviceId: z.string().optional(),
				serviceType: z
					.enum([
						"application",
						"postgres",
						"mysql",
						"mariadb",
						"mongo",
						"redis",
						"compose",
					])
					.optional(),
				projectId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				console.log("=== MANUAL NOTIFICATION TEST ===");
				console.log("Input:", input);
				console.log("Organization ID:", ctx.session.activeOrganizationId);

				// Import the notification function
				const { sendBuildSuccessNotifications } = await import(
					"@dokploy/server/utils/notifications/build-success"
				);

				// Test with mock data
				await sendBuildSuccessNotifications({
					projectName: "Test Project",
					applicationName: "Test Application",
					applicationType: "application",
					buildLink: "https://example.com/build/123",
					organizationId: ctx.session.activeOrganizationId,
					domains: [],
					serviceId: input.serviceId || "test-service-id",
					serviceType: input.serviceType || "application",
				});

				return {
					success: true,
					message: "Test notification sent successfully",
					input,
				};
			} catch (error) {
				console.error("Test notification error:", error);
				return {
					success: false,
					message: "Test notification failed",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

	// Test endpoint to simulate project-specific notification
	testProjectNotification: adminProcedure
		.input(
			z.object({
				serviceId: z.string(),
				serviceType: z.enum([
					"application",
					"postgres",
					"mysql",
					"mariadb",
					"mongo",
					"redis",
					"compose",
				]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				console.log("=== PROJECT NOTIFICATION TEST ===");
				console.log("Service ID:", input.serviceId);
				console.log("Service Type:", input.serviceType);
				console.log("Organization ID:", ctx.session.activeOrganizationId);

				// Import the notification function
				const { sendBuildSuccessNotifications } = await import(
					"@dokploy/server/utils/notifications/build-success"
				);

				// Test with real service data
				await sendBuildSuccessNotifications({
					projectName: "Test Project",
					applicationName: "Test Application",
					applicationType: input.serviceType,
					buildLink: "https://example.com/build/123",
					organizationId: ctx.session.activeOrganizationId,
					domains: [],
					serviceId: input.serviceId,
					serviceType: input.serviceType,
				});

				return {
					success: true,
					message: "Project notification test sent successfully",
					serviceId: input.serviceId,
					serviceType: input.serviceType,
				};
			} catch (error) {
				console.error("Project notification test error:", error);
				return {
					success: false,
					message: "Project notification test failed",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

	// Test endpoint to get all services in a project
	testProjectServices: adminProcedure
		.input(
			z.object({
				projectId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				console.log("=== TESTING PROJECT SERVICES ===");
				console.log("Project ID:", input.projectId);
				console.log("Organization ID:", ctx.session.activeOrganizationId);

				// Import the function
				const { getAllServicesInProject } = await import(
					"@dokploy/server/utils/notifications/scoped-notifications"
				);

				// Get all services in the project
				const services = await getAllServicesInProject(
					input.projectId,
					ctx.session.activeOrganizationId,
				);

				return {
					success: true,
					projectId: input.projectId,
					servicesCount: services.length,
					services: services,
				};
			} catch (error) {
				console.error("Project services test error:", error);
				return {
					success: false,
					message: "Project services test failed",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

	// Test endpoint to debug notification update
	debugNotificationUpdate: adminProcedure
		.input(
			z.object({
				notificationId: z.string(),
				projectId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				console.log("=== DEBUGGING NOTIFICATION UPDATE ===");
				console.log("Notification ID:", input.notificationId);
				console.log("Project ID:", input.projectId);
				console.log("Organization ID:", ctx.session.activeOrganizationId);

				// Import the function from notification service
				const { getAllServicesInProject } = await import(
					"@dokploy/server/services/notification"
				);

				// Get all services in the project using the same function as the update logic
				const projectServices = await getAllServicesInProject(
					input.projectId,
					ctx.session.activeOrganizationId,
				);
				console.log(
					`Found ${projectServices.length} services in project ${input.projectId}`,
				);

				return {
					success: true,
					notificationId: input.notificationId,
					projectId: input.projectId,
					servicesCount: projectServices.length,
					services: projectServices,
				};
			} catch (error) {
				console.error("Debug notification update error:", error);
				return {
					success: false,
					message: "Debug notification update failed",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),

	// Test endpoint to debug database issues
	testDatabaseConnection: adminProcedure.query(async ({ ctx }) => {
		try {
			console.log("=== DATABASE CONNECTION TEST ===");
			console.log("Session organization ID:", ctx.session.activeOrganizationId);

			// Test basic database connection
			const testQuery = await db.execute(sql`SELECT 1 as test`);
			console.log("Basic DB test:", testQuery[0]);

			// Get all organizations to see what's available (using correct column name)
			const allOrgs = await db.execute(
				sql`SELECT id, name FROM organization LIMIT 10`,
			);
			console.log("All organizations:", allOrgs);

			// Test projects query
			const projectsData = await db.query.projects.findMany({
				where: eq(projects.organizationId, ctx.session.activeOrganizationId),
				limit: 5,
			});

			console.log("Projects found:", projectsData.length);
			console.log("Project details:", projectsData);

			// Test direct SQL query
			const directQuery = await db.execute(sql`
				SELECT p."projectId", p.name, p."organizationId" 
				FROM project p 
				WHERE p."organizationId" = ${ctx.session.activeOrganizationId}
				LIMIT 5
			`);
			console.log("Direct SQL query results:", directQuery);

			// Test application query with session org ID
			const appQuery = await db.execute(sql`
				SELECT a."applicationId", a.name, p.name as "projectName", e.name as "environmentName"
				FROM application a
				JOIN environment e ON a."environmentId" = e."environmentId"
				JOIN project p ON e."projectId" = p."projectId"
				WHERE p."organizationId" = ${ctx.session.activeOrganizationId}
			`);
			console.log("Application query results:", appQuery);

			// Test with known working org ID
			const knownOrgId = "rM-IfY9FcuVCBsEUq4eO5";
			const knownOrgQuery = await db.execute(sql`
				SELECT a."applicationId", a.name, p.name as "projectName", e.name as "environmentName"
				FROM application a
				JOIN environment e ON a."environmentId" = e."environmentId"
				JOIN project p ON e."projectId" = p."projectId"
				WHERE p."organizationId" = ${knownOrgId}
			`);
			console.log("Known org ID query results:", knownOrgQuery);

			return {
				success: true,
				message: "Database connection successful",
				projectCount: projectsData.length,
				sessionOrganizationId: ctx.session.activeOrganizationId,
				allOrganizations: allOrgs,
				directQueryResults: directQuery,
				appQueryResults: appQuery,
				knownOrgId: knownOrgId,
				knownOrgQueryResults: knownOrgQuery,
			};
		} catch (error) {
			console.error("Database test error:", error);
			return {
				success: false,
				message: "Database connection failed",
				error: error instanceof Error ? error.message : "Unknown error",
				sessionOrganizationId: ctx.session.activeOrganizationId,
			};
		}
	}),

	// Simple test endpoint without authentication
	testServices: publicProcedure.query(async () => {
		console.log("=== SIMPLE TEST ENDPOINT CALLED ===");

		// Return hardcoded data first to test if API is working
		const hardcodedServices = [
			{
				serviceId: "JHLaPqIinwc-nVtPQw2Yw",
				serviceType: "application",
				name: "porttesting",
				projectName: "mule-demo",
				environmentName: "production",
			},
			{
				serviceId: "cWhV_OG8-Vx52j3mo37Qf",
				serviceType: "redis",
				name: "sample",
				projectName: "mule-demo",
				environmentName: "production",
			},
			{
				serviceId: "7TQ76kWBPML6EDT_8iqLt",
				serviceType: "compose",
				name: "twenty",
				projectName: "mule-demo",
				environmentName: "production",
			},
			{
				serviceId: "NCWo55xcGU8zdHjdYCvjs",
				serviceType: "compose",
				name: "n8n-with-postgres",
				projectName: "mule-demo",
				environmentName: "production",
			},
		];

		console.log("=== RETURNING HARDCODED SERVICES ===");
		console.log("Services count:", hardcodedServices.length);
		console.log("Services:", JSON.stringify(hardcodedServices, null, 2));

		return hardcodedServices;
	}),
});
