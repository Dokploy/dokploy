import {
	createServer,
	defaultCommand,
	deleteServer,
	findServerById,
	findServersByUserId,
	findUserById,
	getPublicIpWithFallback,
	haveActiveServices,
	IS_CLOUD,
	removeDeploymentsByServerId,
	serverAudit,
	serverSetup,
	serverValidate,
	setupMonitoring,
	updateServerById,
	getAccessibleServerIds,
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

export const serverRouter = createTRPCRouter({
	create: withPermission("server", "create")
		.meta({
			openapi: {
				summary: "Create a server",
				description: "Creates a new server in the organization. In cloud mode, enforces the user's server quantity limit. Returns the newly created server.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Get a server",
				description: "Retrieves a single server by its ID. Validates that the user has access to the server within their organization.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Get default server command",
				description: "Returns the default setup command for a server. The command varies depending on whether the server is a build server or a deploy server.",
			},
		})
		.input(apiFindOneServer)
		.query(async ({ input }) => {
			const server = await findServerById(input.serverId);
			const isBuildServer = server.serverType === "build";
			return defaultCommand(isBuildServer);
		}),
	all: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "List all servers",
				description: "Returns all servers in the current organization along with a count of associated services (applications, compose, databases). Results are filtered by the user's accessible server permissions.",
			},
		})
		.query(async ({ ctx }) => {
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
		.meta({
			openapi: {
				summary: "List all servers for permissions",
				description: "Returns a minimal list of servers (ID, name, IP, type) used for configuring member permissions. Requires a valid enterprise license.",
			},
		})
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
	count: protectedProcedure
		.meta({
			openapi: {
				summary: "Get server count",
				description: "Returns the total number of servers across all organizations owned by the current user.",
			},
		})
		.query(async ({ ctx }) => {
		const organizations = await db.query.organization.findMany({
			where: eq(organization.ownerId, ctx.user.id),
			with: {
				servers: true,
			},
		});

		const servers = organizations.flatMap((org) => org.servers);

		return servers.length ?? 0;
	}),
	withSSHKey: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "List servers with SSH keys",
				description: "Returns all deploy-type servers that have an SSH key configured. In cloud mode, only active servers are included. Results are filtered by the user's accessible server permissions.",
			},
		})
		.query(async ({ ctx }) => {
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
	buildServers: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "List build servers",
				description: "Returns all build-type servers that have an SSH key configured. In cloud mode, only active servers are included. Results are filtered by the user's accessible server permissions.",
			},
		})
		.query(async ({ ctx }) => {
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
		.meta({
			openapi: {
				summary: "Setup a server",
				description: "Runs the initial setup process on a remote server, installing required dependencies and configuring Docker. An audit log entry is created.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Validate server configuration",
				description: "Checks the server for required tools and configuration including Docker, Rclone, Nixpacks, Buildpacks, Railpack, Swarm mode, network setup, and privilege mode.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Get server security audit",
				description: "Performs a security audit on the server, checking UFW firewall, SSH configuration, non-root user setup, unattended upgrades, and Fail2Ban status.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Setup server monitoring",
				description: "Configures and deploys the monitoring agent on a server with the specified metrics configuration including refresh rates, retention, thresholds, and container service filters.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Remove a server",
				description: "Deletes a server and removes all associated deployments. Fails if the server has active services. In cloud mode, updates the user's server quantity allocation.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Update a server",
				description: "Updates the configuration of an existing server. Fails if the server is inactive. An audit log entry is created for the update.",
			},
		})
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
	publicIp: protectedProcedure
		.meta({
			openapi: {
				summary: "Get public IP address",
				description: "Returns the public IP address of the local server. Returns an empty string in cloud mode.",
			},
		})
		.query(async () => {
		if (IS_CLOUD) {
			return "";
		}
		const ip = await getPublicIpWithFallback();
		return ip;
	}),
	getServerTime: protectedProcedure
		.meta({
			openapi: {
				summary: "Get server time",
				description: "Returns the current server time and timezone. Returns null in cloud mode.",
			},
		})
		.query(() => {
		if (IS_CLOUD) {
			return null;
		}
		return {
			time: new Date(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		};
	}),
	getServerMetrics: withPermission("monitoring", "read")
		.meta({
			openapi: {
				summary: "Get server metrics",
				description: "Fetches monitoring metrics (CPU, memory, disk, network) from the server's monitoring agent endpoint. Requires the monitoring service to be configured and running.",
			},
		})
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
});
