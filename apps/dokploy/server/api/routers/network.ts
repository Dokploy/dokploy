import {
	assignNetworkToResource,
	createNetwork,
	deleteNetwork,
	findNetworkById,
	findNetworksByOrganizationId,
	getResourceNetworks,
	listServerNetworks,
	removeNetworkFromResource,
	syncNetworks,
	updateNetwork,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiCreateNetwork,
	apiFindOneNetwork,
	apiRemoveNetwork,
	apiUpdateNetwork,
} from "@/server/db/schema";

const RESOURCE_TYPE_ENUM = z.enum([
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
] as const);

export const networkRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateNetwork)
		.mutation(async ({ input, ctx }) => {
			const networkInput = {
				...input,
				organizationId: ctx.session.activeOrganizationId,
			};

			try {
				return await createNetwork(networkInput);
			} catch (error) {
				console.error("Error creating network:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create network",
					cause: error,
				});
			}
		}),

	one: protectedProcedure.input(apiFindOneNetwork).query(async ({ input }) => {
		return await findNetworkById(input.networkId);
	}),

	all: protectedProcedure.query(async ({ ctx }) => {
		return await findNetworksByOrganizationId(ctx.session.activeOrganizationId);
	}),

	allForResource: protectedProcedure
		.input(
			z.object({
				resourceType: RESOURCE_TYPE_ENUM,
				composeType: z.enum(["docker-compose", "stack"]).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const networks = await findNetworksByOrganizationId(
				ctx.session.activeOrganizationId,
			);

			if (
				input.resourceType === "compose" &&
				input.composeType === "docker-compose"
			) {
				return networks;
			}

			return networks.filter((network) => network.driver === "overlay");
		}),

	update: protectedProcedure
		.input(apiUpdateNetwork)
		.mutation(async ({ input, ctx }) => {
			const network = await findNetworkById(input.networkId);

			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this network",
				});
			}

			try {
				return await updateNetwork(input.networkId, input);
			} catch (error) {
				console.error("Error updating network:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update network",
					cause: error,
				});
			}
		}),

	delete: protectedProcedure
		.input(apiRemoveNetwork)
		.mutation(async ({ input, ctx }) => {
			const network = await findNetworkById(input.networkId);

			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this network",
				});
			}

			try {
				return await deleteNetwork(input.networkId);
			} catch (error) {
				console.error("Error deleting network:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete network",
					cause: error,
				});
			}
		}),

	assignToResource: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1),
				resourceId: z.string().min(1),
				resourceType: RESOURCE_TYPE_ENUM,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const network = await findNetworkById(input.networkId);

			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this network",
				});
			}

			try {
				return await assignNetworkToResource(
					input.networkId,
					input.resourceId,
					input.resourceType,
				);
			} catch (error) {
				console.error("Error assigning network to resource:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to assign network to resource",
					cause: error,
				});
			}
		}),

	removeFromResource: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1),
				resourceId: z.string().min(1),
				resourceType: RESOURCE_TYPE_ENUM,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const network = await findNetworkById(input.networkId);

			if (network.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You do not have access to this network",
				});
			}

			try {
				return await removeNetworkFromResource(
					input.networkId,
					input.resourceId,
					input.resourceType,
				);
			} catch (error) {
				console.error("Error removing network from resource:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to remove network from resource",
					cause: error,
				});
			}
		}),

	getResourceNetworks: protectedProcedure
		.input(
			z.object({
				resourceId: z.string().min(1),
				resourceType: RESOURCE_TYPE_ENUM,
			}),
		)
		.query(async ({ input }) => {
			return await getResourceNetworks(input.resourceId, input.resourceType);
		}),

	listAvailableForOrganization: protectedProcedure.query(async ({ ctx }) => {
		return await findNetworksByOrganizationId(ctx.session.activeOrganizationId);
	}),

	listServerNetworks: protectedProcedure
		.input(
			z.object({
				serverId: z.string().nullable().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await listServerNetworks(input.serverId);
		}),

	syncNetworks: protectedProcedure
		.input(
			z.object({
				serverId: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			return await syncNetworks(input.serverId);
		}),
});
