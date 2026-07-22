import {
	createNetwork,
	findNetworkById,
	findNetworksToSync,
	importDockerNetworks,
	inspectNetwork,
	removeNetwork,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateNetwork,
	apiFindOneNetwork,
	apiRemoveNetwork,
	network as networkTable,
} from "@/server/db/schema";

export const networkRouter = createTRPCRouter({
	all: protectedProcedure
		.input(z.object({ serverId: z.string().optional() }))
		.query(async ({ ctx, input }) => {
			const rows = await db.query.network.findMany({
				where: and(
					eq(networkTable.organizationId, ctx.session.activeOrganizationId),
					input.serverId
						? eq(networkTable.serverId, input.serverId)
						: isNull(networkTable.serverId),
				),
				orderBy: desc(networkTable.createdAt),
			});
			return rows;
		}),

	one: protectedProcedure
		.input(apiFindOneNetwork)
		.query(async ({ ctx, input }) => {
			const row = await findNetworkById(input.networkId);
			if (row.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Network not found",
				});
			}
			return row;
		}),
	create: protectedProcedure
		.input(apiCreateNetwork)
		.mutation(async ({ ctx, input }) => {
			return createNetwork(input, ctx.session.activeOrganizationId);
		}),
	networksToSync: protectedProcedure
		.input(z.object({ serverId: z.string().optional() }))
		.query(async ({ ctx, input }) => {
			return findNetworksToSync(
				ctx.session.activeOrganizationId,
				input.serverId ?? null,
			);
		}),

	import: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
				names: z.array(z.string().min(1)).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return importDockerNetworks(
				ctx.session.activeOrganizationId,
				input.serverId ?? null,
				input.names,
			);
		}),

	inspect: protectedProcedure
		.input(apiFindOneNetwork)
		.query(async ({ ctx, input }) => {
			const network = await findNetworkById(input.networkId);
			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Network not found",
				});
			}
			return inspectNetwork(input.networkId);
		}),

	remove: protectedProcedure
		.input(apiRemoveNetwork)
		.mutation(async ({ ctx, input }) => {
			const network = await findNetworkById(input.networkId);
			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Not authorized to delete this network",
				});
			}
			return removeNetwork(input.networkId);
		}),
});
