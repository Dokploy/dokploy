import {
	createServer,
	defaultCommand,
	deleteServer,
	fetchDeploymentMetrics,
	findServerById,
	findServersByUserId,
	findUserById,
	getAccessibleServerIds,
	getPublicIpWithFallback,
	haveActiveServices,
	IS_CLOUD,
	listDeploymentsByServer,
	removeDeploymentsByServerId,
	serverAudit,
	serverSetup,
	serverValidate,
	setupMonitoring,
	updateServerById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
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
	apiUpdateServerMonitoring,
	apiUpdateServerTunnelAccount,
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

			return server;
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
	allForPermissions: withPermission("member", "update").query(
		async ({ ctx }) => {
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
		},
	),
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
				try {
					const { cleanupServer } = await import(
						"@dokploy/server/services/cloudflare/orchestrator"
					);
					await cleanupServer(input.serverId, true);
				} catch (cleanupErr) {
					console.warn("Cloudflare cleanup failed:", cleanupErr);
				}
				await deleteServer(input.serverId);

				if (IS_CLOUD) {
					const admin = await findUserById(ctx.user.ownerId);

					await updateServersBasedOnQuantity(admin.id, admin.serversQuantity);
				}

				return currentServer;
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
	getSystemMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				serverId: z.string().nullable(),
				dataPoints: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const endpoint = await resolveMetricsEndpoint(input.serverId, ctx);
			if (!endpoint) return [];
			const url = new URL(endpoint.baseUrl);
			url.searchParams.append("limit", input.dataPoints);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000);
			let response: Response;
			try {
				response = await fetch(url.toString(), {
					headers: { Authorization: `Bearer ${endpoint.token}` },
					signal: controller.signal,
				});
			} catch (error) {
				if ((error as Error).name === "AbortError") {
					throw new Error(
						"Monitoring agent did not respond within 10s. Ensure the agent is running on this server.",
					);
				}
				throw error;
			} finally {
				clearTimeout(timeout);
			}
			if (!response.ok) {
				throw new Error(
					`Error ${response.status}: ${response.statusText}. Ensure the monitoring agent is running on this server.`,
				);
			}
			const data = await response.json();
			if (!Array.isArray(data)) return [];
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
		}),
	getServerDeployments: withPermission("monitoring", "read")
		.input(
			z.object({
				serverId: z.string().nullable(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (input.serverId !== null) {
				const target = await findServerById(input.serverId);
				if (target.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have access to this server",
					});
				}
			}
			return listDeploymentsByServer(input.serverId);
		}),
	getDeploymentMetrics: withPermission("monitoring", "read")
		.input(
			z.object({
				serverId: z.string().nullable(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const endpoint = await resolveMetricsEndpoint(input.serverId, ctx);
			if (!endpoint) return [];
			const deployments = await listDeploymentsByServer(input.serverId);
			const runningAppNames = deployments
				.filter((d) => d.status === "running" || d.status === "done")
				.map((d) => d.appName);
			return fetchDeploymentMetrics(
				endpoint.baseUrl,
				endpoint.token,
				runningAppNames,
			);
		}),

	getTunnelStatus: withPermission("server", "read")
		.input(z.object({ serverId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to access this server",
				});
			}
			const srv = await db.query.server.findFirst({
				where: and(
					eq(server.serverId, input.serverId),
					eq(server.organizationId, ctx.session.activeOrganizationId),
				),
				columns: {
					serverId: true,
					tunnelStatus: true,
					tunnelId: true,
					tunnelError: true,
					tunnelCheckedAt: true,
				},
			});
			if (!srv) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
			}
			return srv;
		}),

	setupTunnel: withPermission("cloudflare", "update")
		.input(z.object({ serverId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to access this server",
				});
			}
			const srv = await db.query.server.findFirst({
				where: and(
					eq(server.serverId, input.serverId),
					eq(server.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!srv) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
			}
			const { provisionServerTunnel } = await import(
				"@dokploy/server/services/cloudflare/orchestrator"
			);
			await provisionServerTunnel(input.serverId);
			return { ok: true };
		}),

	disableTunnel: withPermission("cloudflare", "update")
		.input(z.object({ serverId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to access this server",
				});
			}
			const srv = await db.query.server.findFirst({
				where: and(
					eq(server.serverId, input.serverId),
					eq(server.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!srv) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
			}
			const { uninstallCloudflaredOnServer } = await import(
				"@dokploy/server/setup/cloudflare-tunnel-setup"
			);
			await uninstallCloudflaredOnServer(input.serverId).catch(() => {});
			await db
				.update(server)
				.set({
					tunnelStatus: "disabled",
					tunnelId: null,
					tunnelToken: null,
					tunnelError: null,
					tunnelCheckedAt: new Date().toISOString(),
				})
				.where(eq(server.serverId, input.serverId));
			return { ok: true };
		}),

	pushTunnelToCloudflare: withPermission("cloudflare", "update")
		.input(z.object({ serverId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to access this server",
				});
			}
			const srv = await db.query.server.findFirst({
				where: and(
					eq(server.serverId, input.serverId),
					eq(server.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!srv) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
			}
			const { pushServerToCloudflare } = await import(
				"@dokploy/server/services/cloudflare/orchestrator"
			);
			await pushServerToCloudflare(input.serverId);
			return { ok: true };
		}),

	setTunnelAccount: withPermission("cloudflare", "update")
		.input(apiUpdateServerTunnelAccount)
		.mutation(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to access this server",
				});
			}
			await db
				.update(server)
				.set({ tunnelAccountId: input.tunnelAccountId })
				.where(
					and(
						eq(server.serverId, input.serverId),
						eq(server.organizationId, ctx.session.activeOrganizationId),
					),
				);
			return { ok: true };
		}),
});

const isValidPort = (port: unknown): port is number =>
	typeof port === "number" &&
	Number.isInteger(port) &&
	port >= 1 &&
	port <= 65535;

async function resolveMetricsEndpoint(
	serverId: string | null,
	ctx: { session: { activeOrganizationId: string } },
): Promise<{ baseUrl: string; token: string } | null> {
	if (serverId === null) {
		const settings = await getWebServerSettings();
		const config = settings?.metricsConfig?.server;
		if (config?.token && settings?.serverIp && isValidPort(config.port)) {
			return {
				baseUrl: `http://${settings.serverIp}:${config.port}/metrics`,
				token: config.token,
			};
		}
		const devUrl = process.env.DOKPLOY_DEV_METRICS_URL;
		const devToken = process.env.DOKPLOY_DEV_METRICS_TOKEN;
		if (devUrl && devToken) {
			return { baseUrl: devUrl, token: devToken };
		}
		return null;
	}

	const target = await findServerById(serverId);
	if (target.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this server",
		});
	}
	const config = target.metricsConfig?.server;
	if (!config?.token || !isValidPort(config.port)) return null;
	return {
		baseUrl: `http://${target.ipAddress}:${config.port}/metrics`,
		token: config.token,
	};
}
