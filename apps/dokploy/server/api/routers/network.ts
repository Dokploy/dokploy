import {
	createNetwork,
	findNetworkById,
	findNetworksToSync,
	importDockerNetworks,
	inspectNetwork,
	recreateNetwork,
	removeNetwork,
	resyncNetwork,
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
import { audit } from "../utils/audit";

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
			const created = await createNetwork(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "network",
				resourceId: created.networkId,
				resourceName: created.name,
			});
			return created;
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
			const result = await importDockerNetworks(
				ctx.session.activeOrganizationId,
				input.serverId ?? null,
				input.names,
			);
			if (result.imported.length > 0) {
				await audit(ctx, {
					action: "create",
					resourceType: "network",
					resourceName: result.imported.join(", "),
					metadata: { imported: result.imported },
				});
			}
			return result;
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

	recreate: protectedProcedure
		.input(apiFindOneNetwork)
		.mutation(async ({ ctx, input }) => {
			const network = await findNetworkById(input.networkId);
			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Network not found",
				});
			}
			const recreated = await recreateNetwork(input.networkId);
			await audit(ctx, {
				action: "reload",
				resourceType: "network",
				resourceId: recreated.networkId,
				resourceName: recreated.name,
			});
			return recreated;
		}),

	resync: protectedProcedure
		.input(apiFindOneNetwork)
		.mutation(async ({ ctx, input }) => {
			const network = await findNetworkById(input.networkId);
			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Network not found",
				});
			}
			const resynced = await resyncNetwork(
				input.networkId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "network",
				resourceId: resynced.networkId,
				resourceName: resynced.name,
			});
			return resynced;
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
			const removed = await removeNetwork(input.networkId);
			await audit(ctx, {
				action: "delete",
				resourceType: "network",
				resourceId: removed.networkId,
				resourceName: removed.name,
			});
			return removed;
		}),
});
