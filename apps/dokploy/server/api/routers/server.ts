import {
	createServer,
	defaultCommand,
	deleteServer,
	findServerById,
	findServersByUserId,
	findUserById,
	getAccessibleServerIds,
	getApplicationStats,
	getPublicIpWithFallback,
	getWebServerSettings,
	hasUnresolvedServerMigration,
	haveActiveServices,
	IS_CLOUD,
	redactServerSshKey,
	removeDeploymentsByServerId,
	serverAudit,
	serverSetup,
	serverValidate,
	setupMonitoring,
	updateServerById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { updateServersBasedOnQuantity } from "@/pages/api/stripe/webhook";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateServer,
	apiFindOneServer,
	apiRemoveServer,
	apiUpdateServer,
	apiUpdateServerBuildsConcurrency,
	apiUpdateServerMonitoring,
	applications,
	compose,
	mariadb,
	mongo,
	mysql,
	organization,
	postgres,
	redis,
	server,
} from "@/server/db/schema";
import { applyDockerCleanupSchedule } from "@/server/utils/docker-cleanup";

const monitoringDataPoints = z.enum([
	"50",
	"200",
	"500",
	"800",
	"1200",
	"1600",
	"2000",
	"all",
]);

type MonitoringContext = {
	session: { userId: string; activeOrganizationId: string };
};

const getMonitoringTarget = async (
	ctx: MonitoringContext,
	serverId?: string,
) => {
	if (!serverId) {
		if (IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "A remote server is required",
			});
		}
		const settings = await getWebServerSettings();
		const metrics = settings?.metricsConfig?.server;
		if (!metrics?.token || !metrics.port) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Monitoring is not configured on the Dokploy server",
			});
		}
		return {
			url: `http://localhost:${metrics.port}`,
			token: metrics.token,
		};
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}

	const target = await findServerById(serverId);
	if (
		target.organizationId !== ctx.session.activeOrganizationId ||
		target.serverStatus !== "active" ||
		target.serverType !== "deploy"
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The target must be an active deployment server",
		});
	}

	const metrics = target.metricsConfig?.server;
	if (!metrics?.token || !metrics.port) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Monitoring is not configured on ${target.name}`,
		});
	}

	const host = target.ipAddress;
	const urlHost =
		host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
	return {
		url: `http://${urlHost}:${metrics.port}`,
		token: metrics.token,
	};
};

const fetchMonitoringMetrics = async ({
	baseUrl,
	token,
	dataPoints,
	appName,
}: {
	baseUrl: string;
	token: string;
	dataPoints: string;
	appName?: string;
}) => {
	const url = new URL(
		appName ? `${baseUrl}/metrics/containers` : `${baseUrl}/metrics`,
	);
	url.searchParams.append("limit", dataPoints);
	if (appName) {
		url.searchParams.append("appName", appName);
	}

	const response = await fetch(url.toString(), {
		headers: { Authorization: ["Bearer", token].join(" ") },
	});
	if (!response.ok) {
		throw new TRPCError({
			code: "BAD_GATEWAY",
			message: `Monitoring returned ${response.status}: ${response.statusText}`,
		});
	}

	const data: unknown = await response.json();
	if (!Array.isArray(data) || data.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: appName
				? `No monitoring data is available for "${appName}"`
				: "No monitoring data is available",
		});
	}
	return data;
};

const parseLocalMetric = (value: unknown) => {
	if (typeof value === "number") return value;
	if (typeof value !== "string") return undefined;
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

const getLocalMonitoringOverview = async () => {
	const stats = await getApplicationStats("dokploy");
	if (!stats) {
		return {};
	}
	const cpu = stats.cpu.at(-1)?.value;
	const memory = stats.memory.at(-1)?.value;
	const disk = stats.disk.at(-1)?.value;

	return {
		cpu: parseLocalMetric(cpu),
		memUsedGB:
			typeof memory === "object" && memory !== null && "used" in memory
				? parseLocalMetric(memory.used)
				: undefined,
		diskUsed:
			typeof disk === "object" && disk !== null && "diskUsedPercentage" in disk
				? parseLocalMetric(disk.diskUsedPercentage)
				: undefined,
	};
};

export const serverRouter = createTRPCRouter({
	create: withPermission("server", "create")
		.input(apiCreateServer)
		.mutation(async ({ ctx, input }) => {
			try {
				const user = await findUserById(ctx.user.ownerId);
				const servers = await findServersByUserId(user.id);
				if (IS_CLOUD && servers.length >= user.serversQuantity) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot create more servers",
					});
				}
				const project = await createServer(
					input,
					ctx.session.activeOrganizationId,
				);
				await applyDockerCleanupSchedule(
					project.serverId,
					ctx.session.activeOrganizationId,
					input.enableDockerCleanup,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "server",
					resourceId: project.serverId,
					resourceName: project.name,
				});
				return project;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the server",
					cause: error,
				});
			}
		}),

	one: withPermission("server", "read")
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			const server = await findServerById(input.serverId);
			if (server.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}

			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}

			return redactServerSshKey(server);
		}),
	getDefaultCommand: withPermission("server", "read")
		.input(apiFindOneServer)
		.query(async ({ input }) => {
			const server = await findServerById(input.serverId);
			const isBuildServer = server.serverType === "build";
			return defaultCommand(isBuildServer);
		}),
	all: withPermission("server", "read").query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleServerIds(ctx.session);

		const result = await db
			.select({
				...getTableColumns(server),
				totalSum: sql<number>`cast(count(${applications.applicationId}) + count(${compose.composeId}) + count(${redis.redisId}) + count(${mariadb.mariadbId}) + count(${mongo.mongoId}) + count(${mysql.mysqlId}) + count(${postgres.postgresId}) as integer)`,
			})
			.from(server)
			.leftJoin(applications, eq(applications.serverId, server.serverId))
			.leftJoin(compose, eq(compose.serverId, server.serverId))
			.leftJoin(redis, eq(redis.serverId, server.serverId))
			.leftJoin(mariadb, eq(mariadb.serverId, server.serverId))
			.leftJoin(mongo, eq(mongo.serverId, server.serverId))
			.leftJoin(mysql, eq(mysql.serverId, server.serverId))
			.leftJoin(postgres, eq(postgres.serverId, server.serverId))
			.where(eq(server.organizationId, ctx.session.activeOrganizationId))
			.orderBy(desc(server.createdAt))
			.groupBy(server.serverId);

		return result.filter((s) => accessibleIds.has(s.serverId));
	}),
	allForPermissions: withPermission("member", "update")
		.use(async ({ ctx, next }) => {
			const licensed = await hasValidLicense(ctx.session.activeOrganizationId);
			if (!licensed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Valid enterprise license required",
				});
			}
			return next();
		})
		.query(async ({ ctx }) => {
			return await db.query.server.findMany({
				columns: {
					serverId: true,
					name: true,
					ipAddress: true,
					serverType: true,
				},
				orderBy: desc(server.createdAt),
				where: eq(server.organizationId, ctx.session.activeOrganizationId),
			});
		}),
	count: protectedProcedure.query(async ({ ctx }) => {
		const organizations = await db.query.organization.findMany({
			where: eq(organization.ownerId, ctx.user.id),
			with: {
				servers: true,
			},
		});

		const servers = organizations.flatMap((org) => org.servers);

		return servers.length ?? 0;
	}),
	withSSHKey: withPermission("server", "read").query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleServerIds(ctx.session);

		const result = await db.query.server.findMany({
			orderBy: desc(server.createdAt),
			where: IS_CLOUD
				? and(
						isNotNull(server.sshKeyId),
						eq(server.organizationId, ctx.session.activeOrganizationId),
						eq(server.serverStatus, "active"),
						eq(server.serverType, "deploy"),
					)
				: and(
						isNotNull(server.sshKeyId),
						eq(server.organizationId, ctx.session.activeOrganizationId),
						eq(server.serverType, "deploy"),
					),
		});
		return result.filter((s) => accessibleIds.has(s.serverId));
	}),
	monitoringServers: withPermission("monitoring", "read").query(
		async ({ ctx }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			const result = await db.query.server.findMany({
				columns: {
					serverId: true,
					name: true,
					ipAddress: true,
					serverStatus: true,
					serverType: true,
					metricsConfig: true,
				},
				orderBy: desc(server.createdAt),
				where: and(
					eq(server.organizationId, ctx.session.activeOrganizationId),
					eq(server.serverStatus, "active"),
					eq(server.serverType, "deploy"),
				),
			});

			return result
				.filter((item) => accessibleIds.has(item.serverId))
				.map((item) => ({
					serverId: item.serverId,
					name: item.name,
					ipAddress: item.ipAddress,
					monitoringConfigured: Boolean(
						item.metricsConfig?.server?.token &&
							item.metricsConfig?.server?.port,
					),
				}));
		},
	),
	monitoringOverview: withPermission("monitoring", "read").query(
		async ({ ctx }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			const remoteServers = await db.query.server.findMany({
				where: and(
					eq(server.organizationId, ctx.session.activeOrganizationId),
					eq(server.serverStatus, "active"),
					eq(server.serverType, "deploy"),
				),
				orderBy: desc(server.createdAt),
			});
			const accessibleServers = remoteServers.filter((item) =>
				accessibleIds.has(item.serverId),
			);
			const targets = [
				...(IS_CLOUD
					? []
					: [{ serverId: undefined, name: "Dokploy Server", ipAddress: null }]),
				...accessibleServers.map((item) => ({
					serverId: item.serverId,
					name: item.name,
					ipAddress: item.ipAddress,
				})),
			];

			return await Promise.all(
				targets.map(async (target) => {
					try {
						if (!target.serverId) {
							return {
								...target,
								available: true as const,
								metrics: await getLocalMonitoringOverview(),
							};
						}
						const monitoringTarget = await getMonitoringTarget(
							ctx,
							target.serverId,
						);
						const metrics = await fetchMonitoringMetrics({
							baseUrl: monitoringTarget.url,
							token: monitoringTarget.token,
							dataPoints: "1",
						});
						return {
							...target,
							available: true as const,
							metrics: metrics.at(-1) as Record<string, unknown>,
						};
					} catch (error) {
						return {
							...target,
							available: false as const,
							metrics: null,
							error:
								error instanceof Error
									? error.message
									: "Monitoring is unavailable",
						};
					}
				}),
			);
		},
	),
	buildServers: withPermission("server", "read").query(async ({ ctx }) => {
		const accessibleIds = await getAccessibleServerIds(ctx.session);

		const result = await db.query.server.findMany({
			orderBy: desc(server.createdAt),
			where: IS_CLOUD
				? and(
						isNotNull(server.sshKeyId),
						eq(server.organizationId, ctx.session.activeOrganizationId),
						eq(server.serverStatus, "active"),
						eq(server.serverType, "build"),
					)
				: and(
						isNotNull(server.sshKeyId),
						eq(server.organizationId, ctx.session.activeOrganizationId),
						eq(server.serverType, "build"),
					),
		});
		return result.filter((s) => accessibleIds.has(s.serverId));
	}),
	setup: withPermission("server", "create")
		.input(apiFindOneServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}
				const currentServer = await serverSetup(input.serverId);
				await audit(ctx, {
					action: "update",
					resourceType: "server",
					resourceId: input.serverId,
					resourceName: server.name,
				});
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	setupWithLogs: withPermission("server", "create")
		.meta({
			openapi: {
				path: "/deploy/server-with-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiFindOneServer)
		.subscription(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}
				return observable<string>((emit) => {
					serverSetup(input.serverId, (log) => {
						emit.next(log);
					});
				});
			} catch (error) {
				throw error;
			}
		}),
	validate: withPermission("server", "read")
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to validate this server",
					});
				}
				const response = await serverValidate(input.serverId);
				return response as unknown as {
					docker: {
						enabled: boolean;
						version: string;
					};
					rclone: {
						enabled: boolean;
						version: string;
					};
					nixpacks: {
						enabled: boolean;
						version: string;
					};
					buildpacks: {
						enabled: boolean;
						version: string;
					};
					railpack: {
						enabled: boolean;
						version: string;
					};
					isDokployNetworkInstalled: boolean;
					isSwarmInstalled: boolean;
					isMainDirectoryInstalled: boolean;
					privilegeMode: string;
					dockerGroupMember: boolean;
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
					cause: error as Error,
				});
			}
		}),

	security: withPermission("server", "read")
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to validate this server",
					});
				}
				const response = await serverAudit(input.serverId);
				return response as unknown as {
					ufw: {
						installed: boolean;
						active: boolean;
						defaultIncoming: string;
					};
					ssh: {
						enabled: boolean;
						keyAuth: boolean;
						permitRootLogin: string;
						passwordAuth: string;
						usePam: string;
					};
					nonRootUser: {
						hasValidSudoUser: boolean;
					};
					unattendedUpgrades: {
						installed: boolean;
						active: boolean;
						updateEnabled: number;
						upgradeEnabled: number;
					};
					fail2ban: {
						installed: boolean;
						enabled: boolean;
						active: boolean;
						sshEnabled: string;
						sshMode: string;
					};
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
					cause: error as Error,
				});
			}
		}),
	setupMonitoring: withPermission("server", "create")
		.input(apiUpdateServerMonitoring)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}

				await updateServerById(input.serverId, {
					metricsConfig: {
						server: {
							type: "Remote",
							refreshRate: input.metricsConfig.server.refreshRate,
							retentionDays: input.metricsConfig.server.retentionDays,
							port: input.metricsConfig.server.port,
							token: input.metricsConfig.server.token,
							urlCallback: input.metricsConfig.server.urlCallback,
							cronJob: input.metricsConfig.server.cronJob,
							thresholds: {
								cpu: input.metricsConfig.server.thresholds.cpu,
								memory: input.metricsConfig.server.thresholds.memory,
							},
						},
						containers: {
							refreshRate: input.metricsConfig.containers.refreshRate,
							services: {
								include: input.metricsConfig.containers.services.include || [],
								exclude: input.metricsConfig.containers.services.exclude || [],
							},
						},
					},
				});
				const currentServer = await setupMonitoring(input.serverId);
				await audit(ctx, {
					action: "update",
					resourceType: "server",
					resourceId: input.serverId,
					resourceName: server.name,
				});
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	remove: withPermission("server", "delete")
		.input(apiRemoveServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentServer = await findServerById(input.serverId);
				if (currentServer.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to delete this server",
					});
				}

				const activeServers = await haveActiveServices(input.serverId);

				if (activeServers) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Server has active services, please delete them first",
					});
				}
				if (await hasUnresolvedServerMigration(input.serverId)) {
					throw new TRPCError({
						code: "CONFLICT",
						message:
							"Server is referenced by an unresolved service migration. Finalize or resolve the migration first.",
					});
				}
				await audit(ctx, {
					action: "delete",
					resourceType: "server",
					resourceId: currentServer.serverId,
					resourceName: currentServer.name,
				});
				await removeDeploymentsByServerId(currentServer);
				await deleteServer(input.serverId);

				if (IS_CLOUD) {
					const admin = await findUserById(ctx.user.ownerId);

					await updateServersBasedOnQuantity(admin.id, admin.serversQuantity);
				}

				return redactServerSshKey(currentServer);
			} catch (error) {
				throw error;
			}
		}),
	update: withPermission("server", "create")
		.input(apiUpdateServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to update this server",
					});
				}

				if (server.serverStatus === "inactive") {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Server is inactive",
					});
				}
				const currentServer = await updateServerById(input.serverId, {
					...input,
				});

				await applyDockerCleanupSchedule(
					input.serverId,
					ctx.session.activeOrganizationId,
					input.enableDockerCleanup,
				);

				await audit(ctx, {
					action: "update",
					resourceType: "server",
					resourceId: input.serverId,
					resourceName: server.name,
				});
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	updateBuildsConcurrency: withPermission("server", "create")
		.input(apiUpdateServerBuildsConcurrency)
		.mutation(async ({ input, ctx }) => {
			const currentServer = await findServerById(input.serverId);
			if (currentServer.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this server",
				});
			}
			return await updateServerById(input.serverId, {
				buildsConcurrency: input.buildsConcurrency,
			});
		}),
	publicIp: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return "";
		}
		const ip = await getPublicIpWithFallback();
		return ip;
	}),
	getServerTime: protectedProcedure.query(() => {
		if (IS_CLOUD) {
			return null;
		}
		return {
			time: new Date(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	}),
	getServerMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				url: z.string(),
				token: z.string(),
				dataPoints: z.string(),
			}),
		)
		.query(async ({ input }) => {
			try {
				const url = new URL(input.url);
				url.searchParams.append("limit", input.dataPoints);
				const response = await fetch(url.toString(), {
					headers: {
						Authorization: `Bearer ${input.token}`,
					},
				});
				if (!response.ok) {
					throw new Error(
						`Error ${response.status}: ${response.statusText}. Ensure the container is running and this service is included in the monitoring configuration.`,
					);
				}

				const data = await response.json();
				if (!Array.isArray(data) || data.length === 0) {
					throw new Error(
						[
							"No monitoring data available. This could be because:",
							"",
							"1. You don't have setup the monitoring service, you can do in web server section.",
							"2. If you already have setup the monitoring service, wait a few minutes and refresh the page.",
						].join("\n"),
					);
				}
				return data as {
					cpu: string;
					cpuModel: string;
					cpuCores: number;
					cpuPhysicalCores: number;
					cpuSpeed: number;
					os: string;
					distro: string;
					kernel: string;
					arch: string;
					memUsed: string;
					memUsedGB: string;
					memTotal: string;
					uptime: number;
					diskUsed: string;
					totalDisk: string;
					networkIn: string;
					networkOut: string;
					timestamp: string;
				}[];
			} catch (error) {
				throw error;
			}
		}),
	getMonitoringMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
				dataPoints: monitoringDataPoints,
			}),
		)
		.query(async ({ input, ctx }) => {
			const target = await getMonitoringTarget(ctx, input.serverId);
			return await fetchMonitoringMetrics({
				baseUrl: target.url,
				token: target.token,
				dataPoints: input.dataPoints,
			});
		}),
	getContainerMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				serverId: z.string(),
				appName: z.string().min(1),
				dataPoints: monitoringDataPoints,
			}),
		)
		.query(async ({ input, ctx }) => {
			const target = await getMonitoringTarget(ctx, input.serverId);
			return await fetchMonitoringMetrics({
				baseUrl: target.url,
				token: target.token,
				dataPoints: input.dataPoints,
				appName: input.appName,
			});
		}),
});
