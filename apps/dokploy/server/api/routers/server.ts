import {
	createServer,
	defaultCommand,
	deleteServer,
	findServerById,
	findServersByUserId,
	findUserById,
	getAccessibleServerIds,
	getAllContainerStats,
	getContainerProcesses,
	getDokployUrl,
	getPublicIpWithFallback,
	getWebServerSettings,
	haveActiveServices,
	IS_CLOUD,
	redactServer,
	redactServers,
	removeDeploymentsByServerId,
	resolveServerMetricsConfigUpdate,
	serverAudit,
	serverSetup,
	serverValidate,
	setupMonitoring,
	updateServerById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { checkPermission } from "@dokploy/server/services/permission";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { assertSshKeyAccess } from "@dokploy/server/services/ssh-key";
import { isRedactedSecretValue } from "@dokploy/server/utils/security/redaction";
import { assertServerDestinationAllowed } from "@dokploy/server/utils/servers/destination";
import { fetchWithPublicEgress } from "@dokploy/server/utils/url/network";
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
	filterContainerResourceStatsByAccess,
	findAccessibleContainerResourceStat,
} from "@/server/api/utils/monitoring-access";
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
import { assertBuildsConcurrencyAllowed } from "@/server/queues/concurrency";
import { applyDockerCleanupSchedule } from "@/server/utils/docker-cleanup";

const getMetricsTarget = async (
	input: { serverId?: string },
	ctx: { session: Parameters<typeof getAccessibleServerIds>[0] },
) => {
	if (input.serverId) {
		const accessibleIds = await getAccessibleServerIds(ctx.session);
		if (!accessibleIds.has(input.serverId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access this server",
			});
		}

		const currentServer = await findServerById(input.serverId);
		if (currentServer.organizationId !== ctx.session.activeOrganizationId) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access this server",
			});
		}

		return {
			host: currentServer.ipAddress,
			port: currentServer.metricsConfig?.server?.port,
			token: currentServer.metricsConfig?.server?.token,
		};
	}

	const settings = await getWebServerSettings();
	return {
		host: settings?.serverIp,
		port: settings?.metricsConfig?.server?.port,
		token: settings?.metricsConfig?.server?.token,
	};
};

const assertServerAccess = async (
	ctx: { session: Parameters<typeof getAccessibleServerIds>[0] },
	serverId: string,
) => {
	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

const assertServerSshKeyUseAllowed = async (
	ctx: {
		user: { id: string };
		session: { activeOrganizationId: string };
	},
	sshKeyId: string | null | undefined,
) => {
	if (!sshKeyId) {
		return;
	}

	await checkPermission(ctx, { sshKeys: ["read"] });
	await assertSshKeyAccess(sshKeyId, ctx.session);
};

const assertServerExecuteAllowed = async (ctx: {
	user: { id: string };
	session: { activeOrganizationId: string };
}) => {
	await checkPermission(ctx, { server: ["execute"] });
};

const assertServerCloudDestinationAllowed = async (input: {
	ipAddress: string;
}) => {
	try {
		await assertServerDestinationAllowed(input);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error
					? error.message
					: "Server address is not allowed in cloud deployments",
		});
	}
};

const buildMetricsRequest = ({
	host,
	port,
	token,
	dataPoints,
}: {
	host?: string | null;
	port?: number | string | null;
	token?: string | null;
	dataPoints: string;
}) => {
	const normalizedHost = host?.trim();
	const normalizedToken = token?.trim();
	const normalizedPort = Number(port);

	if (
		!normalizedHost ||
		!Number.isInteger(normalizedPort) ||
		normalizedPort <= 0 ||
		normalizedPort > 65535 ||
		!normalizedToken
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Monitoring metrics target is not configured",
		});
	}

	const urlHost =
		normalizedHost.includes(":") && !normalizedHost.startsWith("[")
			? `[${normalizedHost}]`
			: normalizedHost;
	const url = new URL(`http://${urlHost}:${normalizedPort}/metrics`);
	url.searchParams.append("limit", dataPoints);

	return {
		url,
		token: normalizedToken,
	};
};

const metricsFetchOptions = {
	allowPrivateNetwork: true,
	fieldName: "Monitoring metrics URL",
} as const;

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
				await assertServerCloudDestinationAllowed(input);
				await assertServerSshKeyUseAllowed(ctx, input.sshKeyId);
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
				return redactServer(project);
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
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
			await assertServerAccess(ctx, input.serverId);
			const server = await findServerById(input.serverId);
			if (server.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}

			return redactServer(server);
		}),
	getDefaultCommand: withPermission("server", "read")
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(ctx, input.serverId);
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

		return redactServers(result.filter((s) => accessibleIds.has(s.serverId)));
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
		return redactServers(result.filter((s) => accessibleIds.has(s.serverId)));
	}),
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
		return redactServers(result.filter((s) => accessibleIds.has(s.serverId)));
	}),
	setup: withPermission("server", "execute")
		.input(apiFindOneServer)
		.mutation(async ({ input, ctx }) => {
			try {
				await assertServerAccess(ctx, input.serverId);
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
	setupWithLogs: withPermission("server", "execute")
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
				await assertServerAccess(ctx, input.serverId);
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
			await assertServerAccess(ctx, input.serverId);
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
			await assertServerAccess(ctx, input.serverId);
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
	setupMonitoring: withPermission("server", "execute")
		.input(apiUpdateServerMonitoring)
		.mutation(async ({ input, ctx }) => {
			try {
				await assertServerAccess(ctx, input.serverId);
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}

				const metricsConfig = resolveServerMetricsConfigUpdate(
					{
						server: {
							type: "Remote",
							refreshRate: input.metricsConfig.server.refreshRate,
							retentionDays: input.metricsConfig.server.retentionDays,
							port: input.metricsConfig.server.port,
							token: input.metricsConfig.server.token,
							urlCallback: `${await getDokployUrl()}/api/trpc/notification.receiveNotification`,
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
					server.metricsConfig,
				);

				await updateServerById(input.serverId, {
					metricsConfig,
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
				await assertServerAccess(ctx, input.serverId);
				const activeServers = await haveActiveServices(input.serverId);

				if (activeServers) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Server has active services, please delete them first",
					});
				}
				const currentServer = await findServerById(input.serverId);
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

				return redactServer(currentServer);
			} catch (error) {
				throw error;
			}
		}),
	update: withPermission("server", "update")
		.input(apiUpdateServer)
		.mutation(async ({ input, ctx }) => {
			try {
				await assertServerAccess(ctx, input.serverId);
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
				await assertServerSshKeyUseAllowed(ctx, input.sshKeyId);
				if (input.command !== undefined) {
					await assertServerExecuteAllowed(ctx);
				}
				await assertServerCloudDestinationAllowed(input);
				const { command, ...serverData } = input;
				const currentServer = await updateServerById(input.serverId, {
					...serverData,
					...(command !== undefined &&
						!isRedactedSecretValue(command) && { command }),
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
				return redactServer(currentServer);
			} catch (error) {
				throw error;
			}
		}),
	updateBuildsConcurrency: withPermission("server", "update")
		.input(apiUpdateServerBuildsConcurrency)
		.mutation(async ({ input, ctx }) => {
			await assertServerAccess(ctx, input.serverId);
			const currentServer = await findServerById(input.serverId);
			if (currentServer.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this server",
				});
			}
			await assertBuildsConcurrencyAllowed(
				input.buildsConcurrency,
				ctx.session.activeOrganizationId,
			);
			const updatedServer = await updateServerById(input.serverId, {
				buildsConcurrency: input.buildsConcurrency,
			});
			return redactServer(updatedServer);
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
			z
				.object({
					serverId: z.string().optional(),
					dataPoints: z.string(),
				})
				.strict(),
		)
		.query(async ({ ctx, input }) => {
			const target = await getMetricsTarget(input, ctx);
			const request = buildMetricsRequest({
				...target,
				dataPoints: input.dataPoints,
			});

			try {
				const response = await fetchWithPublicEgress(
					request.url.toString(),
					{
						headers: {
							Authorization: `Bearer ${request.token}`,
						},
					},
					metricsFetchOptions,
				);
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
	getContainerResourceStats: withPermission("monitoring", "read").query(
		async ({ ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Functionality not available in cloud version",
				});
			}

			const stats = await getAllContainerStats();
			return await filterContainerResourceStatsByAccess(ctx, stats);
		},
	),
	getContainerProcesses: withPermission("monitoring", "read")
		.input(
			z.object({
				containerId: z.string().regex(/^[a-zA-Z0-9.\-_]+$/),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Functionality not available in cloud version",
				});
			}

			const stats = await getAllContainerStats();
			const accessibleStat = await findAccessibleContainerResourceStat(
				ctx,
				stats,
				input.containerId,
			);
			if (!accessibleStat) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this monitored container",
				});
			}

			return await getContainerProcesses(
				accessibleStat.ID ?? accessibleStat.Container ?? input.containerId,
			);
		}),
});
