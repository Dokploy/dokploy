import {
	createNetwork,
	findNetworkById,
	removeNetwork,
	updateNetwork,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateNetwork,
	apiFindOneNetwork,
	apiRemoveNetwork,
	apiUpdateNetwork,
	network as networkTable,
} from "@/server/db/schema";

export const networkRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select()
			.from(networkTable)
			.where(eq(networkTable.organizationId, ctx.session.activeOrganizationId))
			.orderBy(desc(networkTable.createdAt));
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
	update: protectedProcedure
		.input(apiUpdateNetwork)
		.mutation(async ({ ctx, input }) => {
			const network = await findNetworkById(input.networkId);
			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Not authorized to update this network",
				});
			}
			return updateNetwork(input);
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
