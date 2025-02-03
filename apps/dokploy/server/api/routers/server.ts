import { updateServersBasedOnQuantity } from "@/pages/api/stripe/webhook";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
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
	postgres,
	redis,
	server,
} from "@/server/db/schema";
import {
	IS_CLOUD,
	createServer,
	defaultCommand,
	deleteServer,
	findAdminById,
	findServerById,
	findServersByAdminId,
	getPublicIpWithFallback,
	haveActiveServices,
	removeDeploymentsByServerId,
	serverAudit,
	serverSetup,
	serverValidate,
	setupMonitoring,
	updateServerById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";

export const serverRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateServer)
		.mutation(async ({ ctx, input }) => {
			try {
				const admin = await findAdminById(ctx.user.adminId);
				const servers = await findServersByAdminId(admin.adminId);
				if (IS_CLOUD && servers.length >= admin.serversQuantity) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot create more servers",
					});
				}
				const project = await createServer(input, ctx.user.adminId);
				return project;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the server",
					cause: error,
				});
			}
		}),

	one: protectedProcedure
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			const server = await findServerById(input.serverId);
			if (server.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}

			return server;
		}),
	getDefaultCommand: protectedProcedure
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			return defaultCommand();
		}),
	all: protectedProcedure.query(async ({ ctx }) => {
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
			.where(eq(server.adminId, ctx.user.adminId))
			.orderBy(desc(server.createdAt))
			.groupBy(server.serverId);

		return result;
	}),
	withSSHKey: protectedProcedure.query(async ({ ctx }) => {
		const result = await db.query.server.findMany({
			orderBy: desc(server.createdAt),
			where: IS_CLOUD
				? and(
						isNotNull(server.sshKeyId),
						eq(server.adminId, ctx.user.adminId),
						eq(server.serverStatus, "active"),
					)
				: and(isNotNull(server.sshKeyId), eq(server.adminId, ctx.user.adminId)),
		});
		return result;
	}),
	setup: protectedProcedure
		.input(apiFindOneServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to setup this server",
					});
				}
				const currentServer = await serverSetup(input.serverId);
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	setupWithLogs: protectedProcedure
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
				if (server.adminId !== ctx.user.adminId) {
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
	validate: protectedProcedure
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
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
					isDokployNetworkInstalled: boolean;
					isSwarmInstalled: boolean;
					isMainDirectoryInstalled: boolean;
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error?.message : `Error: ${error}`,
					cause: error as Error,
				});
			}
		}),

	security: protectedProcedure
		.input(apiFindOneServer)
		.query(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
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
	setupMonitoring: protectedProcedure
		.input(apiUpdateServerMonitoring)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
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
				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	remove: protectedProcedure
		.input(apiRemoveServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
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
				const currentServer = await findServerById(input.serverId);
				await removeDeploymentsByServerId(currentServer);
				await deleteServer(input.serverId);

				if (IS_CLOUD) {
					const admin = await findAdminById(ctx.user.adminId);

					await updateServersBasedOnQuantity(
						admin.adminId,
						admin.serversQuantity,
					);
				}

				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	update: protectedProcedure
		.input(apiUpdateServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const server = await findServerById(input.serverId);
				if (server.adminId !== ctx.user.adminId) {
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

				return currentServer;
			} catch (error) {
				throw error;
			}
		}),
	publicIp: protectedProcedure.query(async ({ ctx }) => {
		if (IS_CLOUD) {
			return "";
		}
		const ip = await getPublicIpWithFallback();
		return ip;
	}),
});
