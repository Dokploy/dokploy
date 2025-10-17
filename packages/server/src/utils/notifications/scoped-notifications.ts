import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	mariadb,
	mongo,
	mysql,
	notifications,
	postgres,
	redis,
	serviceNotifications,
} from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

export type NotificationEventType =
	| "appDeploy"
	| "appBuildError"
	| "databaseBackup"
	| "dokployRestart"
	| "dockerCleanup"
	| "serverThreshold";

export type ServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose";

/**
 * Get all notifications for a specific service and event type
 */
export const getNotificationsForService = async (
	serviceId: string,
	serviceType: ServiceType,
	eventType: NotificationEventType,
	organizationId: string,
) => {
	console.log("=== GETTING NOTIFICATIONS FOR SERVICE ===");
	console.log(`Service ID: ${serviceId}`);
	console.log(`Service Type: ${serviceType}`);
	console.log(`Event Type: ${eventType}`);
	console.log(`Organization ID: ${organizationId}`);

	const allNotifications = [];

	// Check if there are any service-specific notifications for this service
	// This includes notifications with scope="service" AND notifications with service associations regardless of scope
	const serviceSpecificNotifications = await db.query.notifications.findMany({
		where: and(
			eq(notifications.organizationId, organizationId),
			eq(notifications[eventType], true),
		),
		with: {
			slack: true,
			telegram: true,
			discord: true,
			email: true,
			gotify: true,
			ntfy: true,
			serviceNotifications: {
				where: and(
					eq(serviceNotifications.serviceId, serviceId),
					eq(serviceNotifications.serviceType, serviceType),
				),
			},
		},
	});

	// Filter to only include notifications that are linked to this service
	const filteredServiceNotifications = serviceSpecificNotifications.filter(
		(notification) => notification.serviceNotifications.length > 0,
	);
	console.log(
		`Service-specific notifications found: ${filteredServiceNotifications.length}`,
	);

	// If there are service-specific notifications, ONLY return those (no organization-wide)
	if (filteredServiceNotifications.length > 0) {
		console.log(
			"Found service-specific notifications, returning ONLY those (no organization-wide)",
		);
		allNotifications.push(...filteredServiceNotifications);
	} else {
		console.log(
			"No service-specific notifications found, checking for organization-wide notifications",
		);
		// Only get organization-wide notifications if there are NO service-specific notifications
		const orgNotifications = await db.query.notifications.findMany({
			where: and(
				eq(notifications.organizationId, organizationId),
				eq(notifications.scope, "organization"),
				eq(notifications[eventType], true),
				eq(notifications.isGlobal, true),
			),
			with: {
				slack: true,
				telegram: true,
				discord: true,
				email: true,
				gotify: true,
				ntfy: true,
			},
		});
		console.log(
			`Organization-wide notifications found: ${orgNotifications.length}`,
		);
		allNotifications.push(...orgNotifications);
	}

	console.log(`Total notifications to return: ${allNotifications.length}`);
	return allNotifications;
};

/**
 * Get all services in a project
 */
export const getAllServicesInProject = async (
	projectId: string,
	organizationId: string,
): Promise<
	Array<{ serviceId: string; serviceType: ServiceType; name: string }>
> => {
	console.log("=== GETTING ALL SERVICES IN PROJECT ===");
	console.log(`Project ID: ${projectId}`);
	console.log(`Organization ID: ${organizationId}`);

	const allServices: Array<{
		serviceId: string;
		serviceType: ServiceType;
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

		// Filter applications that belong to this project
		const projectApplications = allApplications.filter(
			(app: any) => app.environment?.project?.projectId === projectId,
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
			(postgres: any) => postgres.environment?.project?.projectId === projectId,
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
			(mysql: any) => mysql.environment?.project?.projectId === projectId,
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
			(mariadb: any) => mariadb.environment?.project?.projectId === projectId,
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
			(mongo: any) => mongo.environment?.project?.projectId === projectId,
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
			(redis: any) => redis.environment?.project?.projectId === projectId,
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
			(compose: any) => compose.environment?.project?.projectId === projectId,
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

/**
 * Get the project ID for a service
 */
export const getProjectIdForService = async (
	serviceId: string,
	serviceType: ServiceType,
): Promise<string | null> => {
	console.log("=== GETTING PROJECT ID FOR SERVICE ===");
	console.log(`Service ID: ${serviceId}`);
	console.log(`Service Type: ${serviceType}`);

	let projectId: string | null = null;

	switch (serviceType) {
		case "application": {
			console.log(`Looking up application with ID: ${serviceId}`);
			const app = await db.query.applications.findFirst({
				where: eq(applications.applicationId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			console.log(
				"Application found:",
				app
					? {
							applicationId: app.applicationId,
							environmentId: app.environmentId,
							projectId: app.environment?.project?.projectId,
							projectName: app.environment?.project?.name,
							organizationId: app.environment?.project?.organizationId,
						}
					: "null",
			);
			projectId = app?.environment?.project?.projectId || null;
			console.log(`Resolved project ID for service ${serviceId}: ${projectId}`);
			break;
		}

		case "postgres": {
			const postgresService = await db.query.postgres.findFirst({
				where: eq(postgres.postgresId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = postgresService?.environment?.project?.projectId || null;
			break;
		}

		case "mysql": {
			const mysqlService = await db.query.mysql.findFirst({
				where: eq(mysql.mysqlId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = mysqlService?.environment?.project?.projectId || null;
			break;
		}

		case "mariadb": {
			const mariadbService = await db.query.mariadb.findFirst({
				where: eq(mariadb.mariadbId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = mariadbService?.environment?.project?.projectId || null;
			break;
		}

		case "mongo": {
			const mongoService = await db.query.mongo.findFirst({
				where: eq(mongo.mongoId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = mongoService?.environment?.project?.projectId || null;
			break;
		}

		case "redis": {
			const redisService = await db.query.redis.findFirst({
				where: eq(redis.redisId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = redisService?.environment?.project?.projectId || null;
			break;
		}

		case "compose": {
			const composeService = await db.query.compose.findFirst({
				where: eq(compose.composeId, serviceId),
				with: {
					environment: {
						with: {
							project: true,
						},
					},
				},
			});
			projectId = composeService?.environment?.project?.projectId || null;
			break;
		}
	}

	console.log(`Final resolved project ID: ${projectId}`);
	return projectId;
};
