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
import { serverSetup } from "@/server/setup/server-setup";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm";
import { removeDeploymentsByServerId } from "../services/deployment";
import {
	createServer,
	deleteServer,
	findServerById,
	haveActiveServices,
	updateServerById,
} from "../services/server";

export const serverRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateServer)
		.mutation(async ({ ctx, input }) => {
			try {
				const project = await createServer(input, ctx.user.adminId);
				return project;
			} catch (error) {
				console.log(error);
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
			return await findServerById(input.serverId);
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
	withSSHKey: protectedProcedure.query(async ({ input, ctx }) => {
		return await db.query.server.findMany({
			orderBy: desc(server.createdAt),
			where: and(
				isNotNull(server.sshKeyId),
				eq(server.adminId, ctx.user.adminId),
			),
		});
	}),
	setup: protectedProcedure
		.input(apiFindOneServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentServer = await serverSetup(input.serverId);
				return currentServer;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to setup this server",
					cause: error,
				});
			}
		}),
	remove: protectedProcedure
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
				await removeDeploymentsByServerId(currentServer);
				await deleteServer(input.serverId);

				return currentServer;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to delete this server",
					cause: error,
				});
			}
		}),
	update: protectedProcedure
		.input(apiUpdateServer)
		.mutation(async ({ input }) => {
			try {
				const currentServer = await updateServerById(input.serverId, {
					...input,
				});

				return currentServer;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to update this server",
					cause: error,
				});
			}
		}),
});
