import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateServer,
	apiFindOneServer,
	apiRemoveProject,
	apiRemoveServer,
	apiUpdateServer,
	server,
} from "@/server/db/schema";
import { setupServer } from "@/server/utils/servers/setup-server";
import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { removeDeploymentsByServerId } from "../services/deployment";
import {
	createServer,
	deleteServer,
	findServerById,
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
		return await db.query.server.findMany({
			orderBy: desc(server.createdAt),
		});
	}),
	setup: protectedProcedure
		.input(apiFindOneServer)
		.mutation(async ({ input, ctx }) => {
			try {
				const currentServer = await setupServer(input.serverId);
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
