import { db } from "@dokploy/server/db";
import {
	type apiCreateDiscord,
	type apiCreateEmail,
	type apiCreateGotify,
	type apiCreateNtfy,
	type apiCreateSlack,
	type apiCreateTelegram,
	type apiUpdateDiscord,
	type apiUpdateEmail,
	type apiUpdateGotify,
	type apiUpdateNtfy,
	type apiUpdateSlack,
	type apiUpdateTelegram,
	applications,
	compose,
	discord,
	email,
	gotify,
	mariadb,
	mongo,
	mysql,
	notifications,
	ntfy,
	postgres,
	projectNotifications,
	redis,
	serviceNotifications,
	slack,
	telegram,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

// Helper function to get all services in a project
export const getAllServicesInProject = async (
	projectId: string,
	organizationId: string,
) => {
	console.log("=== GETTING ALL SERVICES IN PROJECT FOR AUTO-POPULATION ===");
	console.log(`Project ID: ${projectId}`);
	console.log(`Organization ID: ${organizationId}`);

	const allServices: Array<{
		serviceId: string;
		serviceType: string;
		name: string;
	}> = [];

	try {
		// Get all applications in the project
		const allApplications = await db.query.applications.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		// Filter applications that belong to this project and organization
		const projectApplications = allApplications.filter(
			(app: any) =>
				app.environment?.project?.projectId === projectId &&
				app.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectApplications.length} applications in project ${projectId}`,
		);

		for (const app of projectApplications) {
			allServices.push({
				serviceId: app.applicationId,
				serviceType: "application",
				name: app.name,
			});
		}

		// Get all PostgreSQL services in the project
		const postgresServices = await db.query.postgres.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectPostgres = postgresServices.filter(
			(postgres: any) =>
				postgres.environment?.project?.projectId === projectId &&
				postgres.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectPostgres.length} PostgreSQL services in project ${projectId}`,
		);

		for (const postgres of projectPostgres) {
			allServices.push({
				serviceId: postgres.postgresId,
				serviceType: "postgres",
				name: postgres.name,
			});
		}

		// Get all MySQL services in the project
		const mysqlServices = await db.query.mysql.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectMysql = mysqlServices.filter(
			(mysql: any) =>
				mysql.environment?.project?.projectId === projectId &&
				mysql.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectMysql.length} MySQL services in project ${projectId}`,
		);

		for (const mysql of projectMysql) {
			allServices.push({
				serviceId: mysql.mysqlId,
				serviceType: "mysql",
				name: mysql.name,
			});
		}

		// Get all MariaDB services in the project
		const mariadbServices = await db.query.mariadb.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectMariadb = mariadbServices.filter(
			(mariadb: any) =>
				mariadb.environment?.project?.projectId === projectId &&
				mariadb.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectMariadb.length} MariaDB services in project ${projectId}`,
		);

		for (const mariadb of projectMariadb) {
			allServices.push({
				serviceId: mariadb.mariadbId,
				serviceType: "mariadb",
				name: mariadb.name,
			});
		}

		// Get all MongoDB services in the project
		const mongoServices = await db.query.mongo.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectMongo = mongoServices.filter(
			(mongo: any) =>
				mongo.environment?.project?.projectId === projectId &&
				mongo.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectMongo.length} MongoDB services in project ${projectId}`,
		);

		for (const mongo of projectMongo) {
			allServices.push({
				serviceId: mongo.mongoId,
				serviceType: "mongo",
				name: mongo.name,
			});
		}

		// Get all Redis services in the project
		const redisServices = await db.query.redis.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectRedis = redisServices.filter(
			(redis: any) =>
				redis.environment?.project?.projectId === projectId &&
				redis.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectRedis.length} Redis services in project ${projectId}`,
		);

		for (const redis of projectRedis) {
			allServices.push({
				serviceId: redis.redisId,
				serviceType: "redis",
				name: redis.name,
			});
		}

		// Get all Compose services in the project
		const composeServices = await db.query.compose.findMany({
			with: {
				environment: {
					with: {
						project: true,
					},
				},
			},
		});

		const projectCompose = composeServices.filter(
			(compose: any) =>
				compose.environment?.project?.projectId === projectId &&
				compose.environment?.project?.organizationId === organizationId,
		);

		console.log(
			`Found ${projectCompose.length} Compose services in project ${projectId}`,
		);

		for (const compose of projectCompose) {
			allServices.push({
				serviceId: compose.composeId,
				serviceType: "compose",
				name: compose.name,
			});
		}

		console.log(
			`Total services found in project ${projectId}: ${allServices.length}`,
		);
		console.log(
			"Services:",
			allServices.map((s) => `${s.name} (${s.serviceType})`),
		);

		return allServices;
	} catch (error) {
		console.error(`Error getting services for project ${projectId}:`, error);
		return [];
	}
};

export type Notification = typeof notifications.$inferSelect;

// New functions for scoped notifications
export const createProjectNotification = async (
	notificationId: string,
	projectId: string,
) => {
	return await db
		.insert(projectNotifications)
		.values({
			notificationId,
			projectId,
		})
		.returning()
		.then((value) => value[0]);
};

export const createServiceNotification = async (
	notificationId: string,
	serviceId: string,
	serviceType: string,
) => {
	return await db
		.insert(serviceNotifications)
		.values({
			notificationId,
			serviceId,
			serviceType,
		})
		.returning()
		.then((value) => value[0]);
};

export const removeProjectNotification = async (
	notificationId: string,
	projectId: string,
) => {
	return await db
		.delete(projectNotifications)
		.where(
			and(
				eq(projectNotifications.notificationId, notificationId),
				eq(projectNotifications.projectId, projectId),
			),
		);
};

export const removeServiceNotification = async (
	notificationId: string,
	serviceId: string,
	serviceType: string,
) => {
	return await db
		.delete(serviceNotifications)
		.where(
			and(
				eq(serviceNotifications.notificationId, notificationId),
				eq(serviceNotifications.serviceId, serviceId),
				eq(serviceNotifications.serviceType, serviceType),
			),
		);
};

export const updateNotificationScope = async (
	notificationId: string,
	scope: "organization" | "project" | "service",
	isGlobal?: boolean,
) => {
	return await db
		.update(notifications)
		.set({
			scope,
			isGlobal: isGlobal ?? scope === "organization",
		})
		.where(eq(notifications.notificationId, notificationId))
		.returning()
		.then((value) => value[0]);
};

export const createSlackNotification = async (
	input: typeof apiCreateSlack._type,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		const newSlack = await tx
			.insert(slack)
			.values({
				channel: input.channel,
				webhookUrl: input.webhookUrl,
			})
			.returning()
			.then((value) => value[0]);

		if (!newSlack) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting slack",
			});
		}

		// Create the notification with scope fields if they exist, otherwise fallback to basic fields
		const notificationData: any = {
			slackId: newSlack.slackId,
			name: input.name,
			appDeploy: input.appDeploy,
			appBuildError: input.appBuildError,
			databaseBackup: input.databaseBackup,
			dokployRestart: input.dokployRestart,
			dockerCleanup: input.dockerCleanup,
			notificationType: "slack",
			organizationId: organizationId,
			serverThreshold: input.serverThreshold,
		};

		// Add scope fields if they exist in the input
		// If project scope is selected, change it to service scope
		if (input.scope !== undefined) {
			if (input.scope === "project") {
				notificationData.scope = "service";
				console.log(
					`Changed scope from "project" to "service" for auto-population`,
				);
			} else {
				notificationData.scope = input.scope;
			}
		}
		if (input.isGlobal !== undefined) {
			notificationData.isGlobal = input.isGlobal;
		}

		const newDestination = await tx
			.insert(notifications)
			.values(notificationData)
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		// Handle project-specific notifications (only if tables exist)
		// When project scope is selected, treat it as service scope with auto-populated services
		if (
			input.scope === "project" &&
			input.projectIds &&
			input.projectIds.length > 0
		) {
			try {
				console.log(
					"=== CREATING PROJECT-SPECIFIC NOTIFICATION (AS SERVICE SCOPE) ===",
				);
				console.log(`Project IDs: ${JSON.stringify(input.projectIds)}`);

				// Auto-populate service associations for all services in the selected projects
				console.log(
					"Auto-populating service associations for project-specific notification",
				);
				for (const projectId of input.projectIds) {
					const projectServices = await getAllServicesInProject(
						projectId,
						organizationId,
					);
					console.log(
						`Found ${projectServices.length} services in project ${projectId} for auto-population`,
					);

					if (projectServices.length > 0) {
						await tx.insert(serviceNotifications).values(
							projectServices.map((service) => ({
								notificationId: newDestination.notificationId,
								serviceId: service.serviceId,
								serviceType: service.serviceType,
							})),
						);
						console.log(
							`Auto-populated ${projectServices.length} service associations for project ${projectId}`,
						);
					}
				}
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		// Handle service-specific notifications (only if tables exist)
		if (
			input.scope === "service" &&
			input.serviceConfigs &&
			input.serviceConfigs.length > 0
		) {
			try {
				console.log("=== CREATING SERVICE-SPECIFIC NOTIFICATION ===");
				console.log(`Service configs: ${JSON.stringify(input.serviceConfigs)}`);

				await tx.insert(serviceNotifications).values(
					input.serviceConfigs.map((config) => ({
						notificationId: newDestination.notificationId,
						serviceId: config.serviceId,
						serviceType: config.serviceType,
					})),
				);
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		return newDestination;
	});
};

export const updateSlackNotification = async (
	input: typeof apiUpdateSlack._type,
) => {
	return await db.transaction(async (tx) => {
		// Prepare notification data with scope fields
		const notificationData: any = {
			name: input.name,
			appDeploy: input.appDeploy,
			appBuildError: input.appBuildError,
			databaseBackup: input.databaseBackup,
			dokployRestart: input.dokployRestart,
			dockerCleanup: input.dockerCleanup,
			organizationId: input.organizationId || "",
			serverThreshold: input.serverThreshold,
		};

		// Add scope fields if they exist in the input
		// If project scope is selected, change it to service scope
		if (input.scope !== undefined) {
			if (input.scope === "project") {
				notificationData.scope = "service";
				console.log(
					`Changed scope from "project" to "service" for auto-population`,
				);
			} else {
				notificationData.scope = input.scope;
			}
		}
		if (input.isGlobal !== undefined) {
			notificationData.isGlobal = input.isGlobal;
		}

		const newDestination = await tx
			.update(notifications)
			.set(notificationData)
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(slack)
			.set({
				channel: input.channel,
				webhookUrl: input.webhookUrl,
			})
			.where(eq(slack.slackId, input.slackId))
			.returning()
			.then((value) => value[0]);

		// Handle project-specific notifications (only if tables exist)
		// When project scope is selected, treat it as service scope with auto-populated services
		if (
			input.scope === "project" &&
			input.projectIds &&
			input.projectIds.length > 0
		) {
			try {
				console.log(
					"=== UPDATING PROJECT NOTIFICATIONS AS SERVICE SCOPE (SLACK) ===",
				);
				console.log(`Notification ID: ${input.notificationId}`);
				console.log(`Project IDs: ${JSON.stringify(input.projectIds)}`);

				// Auto-populate service associations for all services in the selected projects
				console.log(
					"Auto-populating service associations for project-specific notification update",
				);
				for (const projectId of input.projectIds) {
					const projectServices = await getAllServicesInProject(
						projectId,
						input.organizationId!,
					);
					console.log(
						`Found ${projectServices.length} services in project ${projectId} for auto-population`,
					);

					if (projectServices.length > 0) {
						// Remove existing service notifications for this notification
						await tx
							.delete(serviceNotifications)
							.where(
								eq(serviceNotifications.notificationId, input.notificationId),
							);

						// Insert new service notifications
						await tx.insert(serviceNotifications).values(
							projectServices.map((service) => ({
								notificationId: input.notificationId,
								serviceId: service.serviceId,
								serviceType: service.serviceType,
							})),
						);
						console.log(
							`Auto-populated ${projectServices.length} service associations for project ${projectId}`,
						);
					}
				}
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.error("Service notifications table error:", error);
				console.warn("Service notifications table not available:", error);
			}
		}

		// Handle service-specific notifications (only if tables exist)
		if (
			input.scope === "service" &&
			input.serviceConfigs &&
			input.serviceConfigs.length > 0
		) {
			try {
				console.log("=== UPDATING SERVICE NOTIFICATIONS (SLACK) ===");
				console.log(`Service configs: ${JSON.stringify(input.serviceConfigs)}`);

				// First, remove existing service notifications
				await tx
					.delete(serviceNotifications)
					.where(eq(serviceNotifications.notificationId, input.notificationId));

				// Then, insert new service notifications
				await tx.insert(serviceNotifications).values(
					input.serviceConfigs.map((config) => ({
						notificationId: input.notificationId,
						serviceId: config.serviceId,
						serviceType: config.serviceType,
					})),
				);
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		return newDestination;
	});
};

export const createTelegramNotification = async (
	input: typeof apiCreateTelegram._type,
	organizationId: string,
) => {
	await db.transaction(async (tx) => {
		const newTelegram = await tx
			.insert(telegram)
			.values({
				botToken: input.botToken,
				chatId: input.chatId,
				messageThreadId: input.messageThreadId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newTelegram) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting telegram",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				telegramId: newTelegram.telegramId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "telegram",
				organizationId: organizationId,
				serverThreshold: input.serverThreshold,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateTelegramNotification = async (
	input: typeof apiUpdateTelegram._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				organizationId: input.organizationId || "",
				serverThreshold: input.serverThreshold,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(telegram)
			.set({
				botToken: input.botToken,
				chatId: input.chatId,
				messageThreadId: input.messageThreadId,
			})
			.where(eq(telegram.telegramId, input.telegramId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const createDiscordNotification = async (
	input: typeof apiCreateDiscord._type,
	organizationId: string,
) => {
	return await db.transaction(async (tx) => {
		const newDiscord = await tx
			.insert(discord)
			.values({
				webhookUrl: input.webhookUrl,
				decoration: input.decoration,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDiscord) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting discord",
			});
		}

		// Create the notification with scope fields if they exist, otherwise fallback to basic fields
		const notificationData: any = {
			discordId: newDiscord.discordId,
			name: input.name,
			appDeploy: input.appDeploy,
			appBuildError: input.appBuildError,
			databaseBackup: input.databaseBackup,
			dokployRestart: input.dokployRestart,
			dockerCleanup: input.dockerCleanup,
			notificationType: "discord",
			organizationId: organizationId,
			serverThreshold: input.serverThreshold,
		};

		// Add scope fields if they exist in the input
		// If project scope is selected, change it to service scope
		if (input.scope !== undefined) {
			if (input.scope === "project") {
				notificationData.scope = "service";
				console.log(
					`Changed scope from "project" to "service" for auto-population`,
				);
			} else {
				notificationData.scope = input.scope;
			}
		}
		if (input.isGlobal !== undefined) {
			notificationData.isGlobal = input.isGlobal;
		}

		const newDestination = await tx
			.insert(notifications)
			.values(notificationData)
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		// Handle project-specific notifications (only if tables exist)
		// When project scope is selected, treat it as service scope with auto-populated services
		if (
			input.scope === "project" &&
			input.projectIds &&
			input.projectIds.length > 0
		) {
			try {
				console.log(
					"=== CREATING PROJECT-SPECIFIC NOTIFICATION AS SERVICE SCOPE (DISCORD) ===",
				);
				console.log(`Project IDs: ${JSON.stringify(input.projectIds)}`);

				// Auto-populate service associations for all services in the selected projects
				console.log(
					"Auto-populating service associations for project-specific notification",
				);
				for (const projectId of input.projectIds) {
					const projectServices = await getAllServicesInProject(
						projectId,
						organizationId,
					);
					console.log(
						`Found ${projectServices.length} services in project ${projectId} for auto-population`,
					);

					if (projectServices.length > 0) {
						await tx.insert(serviceNotifications).values(
							projectServices.map((service) => ({
								notificationId: newDestination.notificationId,
								serviceId: service.serviceId,
								serviceType: service.serviceType,
							})),
						);
						console.log(
							`Auto-populated ${projectServices.length} service associations for project ${projectId}`,
						);
					}
				}
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		// Handle service-specific notifications (only if tables exist)
		if (
			input.scope === "service" &&
			input.serviceConfigs &&
			input.serviceConfigs.length > 0
		) {
			try {
				console.log("=== CREATING SERVICE-SPECIFIC NOTIFICATION (DISCORD) ===");
				console.log(`Service configs: ${JSON.stringify(input.serviceConfigs)}`);

				await tx.insert(serviceNotifications).values(
					input.serviceConfigs.map((config) => ({
						notificationId: newDestination.notificationId,
						serviceId: config.serviceId,
						serviceType: config.serviceType,
					})),
				);
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		return newDestination;
	});
};

export const updateDiscordNotification = async (
	input: typeof apiUpdateDiscord._type,
) => {
	return await db.transaction(async (tx) => {
		// Prepare notification data with scope fields
		const notificationData: any = {
			name: input.name,
			appDeploy: input.appDeploy,
			appBuildError: input.appBuildError,
			databaseBackup: input.databaseBackup,
			dokployRestart: input.dokployRestart,
			dockerCleanup: input.dockerCleanup,
			organizationId: input.organizationId || "",
			serverThreshold: input.serverThreshold,
		};

		// Add scope fields if they exist in the input
		// If project scope is selected, change it to service scope
		if (input.scope !== undefined) {
			if (input.scope === "project") {
				notificationData.scope = "service";
				console.log(
					`Changed scope from "project" to "service" for auto-population`,
				);
			} else {
				notificationData.scope = input.scope;
			}
		}
		if (input.isGlobal !== undefined) {
			notificationData.isGlobal = input.isGlobal;
		}

		const newDestination = await tx
			.update(notifications)
			.set(notificationData)
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(discord)
			.set({
				webhookUrl: input.webhookUrl,
				decoration: input.decoration,
			})
			.where(eq(discord.discordId, input.discordId))
			.returning()
			.then((value) => value[0]);

		// Handle project-specific notifications (only if tables exist)
		// When project scope is selected, treat it as service scope with auto-populated services
		if (
			input.scope === "project" &&
			input.projectIds &&
			input.projectIds.length > 0
		) {
			try {
				console.log(
					"=== UPDATING PROJECT NOTIFICATIONS AS SERVICE SCOPE (DISCORD) ===",
				);
				console.log(`Notification ID: ${input.notificationId}`);
				console.log(`Project IDs: ${JSON.stringify(input.projectIds)}`);

				// Auto-populate service associations for all services in the selected projects
				console.log(
					"Auto-populating service associations for project-specific notification update",
				);
				for (const projectId of input.projectIds) {
					const projectServices = await getAllServicesInProject(
						projectId,
						input.organizationId!,
					);
					console.log(
						`Found ${projectServices.length} services in project ${projectId} for auto-population`,
					);

					if (projectServices.length > 0) {
						// Remove existing service notifications for this notification
						await tx
							.delete(serviceNotifications)
							.where(
								eq(serviceNotifications.notificationId, input.notificationId),
							);

						// Insert new service notifications
						await tx.insert(serviceNotifications).values(
							projectServices.map((service) => ({
								notificationId: input.notificationId,
								serviceId: service.serviceId,
								serviceType: service.serviceType,
							})),
						);
						console.log(
							`Auto-populated ${projectServices.length} service associations for project ${projectId}`,
						);
					}
				}
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		// Handle service-specific notifications (only if tables exist)
		if (
			input.scope === "service" &&
			input.serviceConfigs &&
			input.serviceConfigs.length > 0
		) {
			try {
				console.log("=== UPDATING SERVICE NOTIFICATIONS (DISCORD) ===");
				console.log(`Service configs: ${JSON.stringify(input.serviceConfigs)}`);

				// First, remove existing service notifications
				await tx
					.delete(serviceNotifications)
					.where(eq(serviceNotifications.notificationId, input.notificationId));

				// Then, insert new service notifications
				await tx.insert(serviceNotifications).values(
					input.serviceConfigs.map((config) => ({
						notificationId: input.notificationId,
						serviceId: config.serviceId,
						serviceType: config.serviceType,
					})),
				);
			} catch (error) {
				// If service_notifications table doesn't exist, log warning but don't fail
				console.warn("Service notifications table not available:", error);
			}
		}

		return newDestination;
	});
};

export const createEmailNotification = async (
	input: typeof apiCreateEmail._type,
	organizationId: string,
) => {
	await db.transaction(async (tx) => {
		const newEmail = await tx
			.insert(email)
			.values({
				smtpServer: input.smtpServer,
				smtpPort: input.smtpPort,
				username: input.username,
				password: input.password,
				fromAddress: input.fromAddress,
				toAddresses: input.toAddresses,
			})
			.returning()
			.then((value) => value[0]);

		if (!newEmail) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting email",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				emailId: newEmail.emailId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "email",
				organizationId: organizationId,
				serverThreshold: input.serverThreshold,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateEmailNotification = async (
	input: typeof apiUpdateEmail._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				organizationId: input.organizationId || "",
				serverThreshold: input.serverThreshold,
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(email)
			.set({
				smtpServer: input.smtpServer,
				smtpPort: input.smtpPort,
				username: input.username,
				password: input.password,
				fromAddress: input.fromAddress,
				toAddresses: input.toAddresses,
			})
			.where(eq(email.emailId, input.emailId))
			.returning()
			.then((value) => value[0]);

		return newDestination;
	});
};

export const createGotifyNotification = async (
	input: typeof apiCreateGotify._type,
	organizationId: string,
) => {
	await db.transaction(async (tx) => {
		const newGotify = await tx
			.insert(gotify)
			.values({
				serverUrl: input.serverUrl,
				appToken: input.appToken,
				priority: input.priority,
				decoration: input.decoration,
			})
			.returning()
			.then((value) => value[0]);

		if (!newGotify) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting gotify",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				gotifyId: newGotify.gotifyId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "gotify",
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateGotifyNotification = async (
	input: typeof apiUpdateGotify._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				organizationId: input.organizationId || "",
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(gotify)
			.set({
				serverUrl: input.serverUrl,
				appToken: input.appToken,
				priority: input.priority,
				decoration: input.decoration,
			})
			.where(eq(gotify.gotifyId, input.gotifyId));

		return newDestination;
	});
};

export const createNtfyNotification = async (
	input: typeof apiCreateNtfy._type,
	organizationId: string,
) => {
	await db.transaction(async (tx) => {
		const newNtfy = await tx
			.insert(ntfy)
			.values({
				serverUrl: input.serverUrl,
				topic: input.topic,
				accessToken: input.accessToken,
				priority: input.priority,
			})
			.returning()
			.then((value) => value[0]);

		if (!newNtfy) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting ntfy",
			});
		}

		const newDestination = await tx
			.insert(notifications)
			.values({
				ntfyId: newNtfy.ntfyId,
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				notificationType: "ntfy",
				organizationId: organizationId,
			})
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error input: Inserting notification",
			});
		}

		return newDestination;
	});
};

export const updateNtfyNotification = async (
	input: typeof apiUpdateNtfy._type,
) => {
	await db.transaction(async (tx) => {
		const newDestination = await tx
			.update(notifications)
			.set({
				name: input.name,
				appDeploy: input.appDeploy,
				appBuildError: input.appBuildError,
				databaseBackup: input.databaseBackup,
				dokployRestart: input.dokployRestart,
				dockerCleanup: input.dockerCleanup,
				organizationId: input.organizationId || "",
			})
			.where(eq(notifications.notificationId, input.notificationId))
			.returning()
			.then((value) => value[0]);

		if (!newDestination) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error Updating notification",
			});
		}

		await tx
			.update(ntfy)
			.set({
				serverUrl: input.serverUrl,
				topic: input.topic,
				accessToken: input.accessToken,
				priority: input.priority,
			})
			.where(eq(ntfy.ntfyId, input.ntfyId));

		return newDestination;
	});
};

export const findNotificationById = async (notificationId: string) => {
	const notification = await db.query.notifications.findFirst({
		where: eq(notifications.notificationId, notificationId),
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
	});
	if (!notification) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Notification not found",
		});
	}
	return notification;
};

export const removeNotificationById = async (notificationId: string) => {
	const result = await db
		.delete(notifications)
		.where(eq(notifications.notificationId, notificationId))
		.returning();

	return result[0];
};

export const updateNotificationById = async (
	notificationId: string,
	notificationData: Partial<Notification>,
) => {
	const result = await db
		.update(notifications)
		.set({
			...notificationData,
		})
		.where(eq(notifications.notificationId, notificationId))
		.returning();

	return result[0];
};
