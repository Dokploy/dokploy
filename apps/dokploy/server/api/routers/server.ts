import { updateServersBasedOnQuantity } from "@/pages/api/stripe/webhook";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateServer,
	apiFindOneServer,
	apiRemoveServer,
	apiUpdateServer,
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
	deleteServer,
	findAdminById,
	findServerById,
	findServersByAdminId,
	getPublicIpWithFallback,
	haveActiveServices,
	removeDeploymentsByServerId,
	serverSetup,
	serverValidate,
	updateServerById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
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
					message: "Error to create the server",
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
					isDockerInstalled: boolean;
					isRCloneInstalled: boolean;
					isSwarmInstalled: boolean;
					isNixpacksInstalled: boolean;
					isBuildpacksInstalled: boolean;
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
