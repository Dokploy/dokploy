import {
	assignNetworkToResource,
	createNetwork,
	deleteNetwork,
	findNetworkById,
	findNetworksByOrganizationId,
	findNetworksByOrganizationIdAndServerId,
	findResourceById,
	getAllNetworksByServer,
	getResourceNetworks,
	importOrphanedNetworks,
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

const RESOURCE_TYPE_WITH_PREVIEW_ENUM = z.enum([
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"preview",
] as const);

const handleTRPCError = (
	error: unknown,
	message: string,
	logMessage: string,
) => {
	console.error(logMessage, error);
	if (error instanceof TRPCError) {
		throw error;
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message,
		cause: error,
	});
};

const verifyNetworkAccess = async (
	networkId: string,
	organizationId: string,
) => {
	const network = await findNetworkById(networkId);

	if (network.organizationId !== organizationId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this network",
		});
	}

	return network;
};

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
				handleTRPCError(
					error,
					"Failed to create network",
					"Error creating network:",
				);
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
				resourceId: z.string().min(1),
				composeType: z.enum(["docker-compose", "stack"]).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const resource = await findResourceById(
				input.resourceId,
				input.resourceType,
			);
			const resourceServerId = resource.serverId || null;

			const networks = await findNetworksByOrganizationIdAndServerId(
				ctx.session.activeOrganizationId,
				resourceServerId,
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
			await verifyNetworkAccess(
				input.networkId,
				ctx.session.activeOrganizationId,
			);

			try {
				return await updateNetwork(input.networkId, input);
			} catch (error) {
				handleTRPCError(
					error,
					"Failed to update network",
					"Error updating network:",
				);
			}
		}),

	delete: protectedProcedure
		.input(apiRemoveNetwork)
		.mutation(async ({ input, ctx }) => {
			await verifyNetworkAccess(
				input.networkId,
				ctx.session.activeOrganizationId,
			);

			try {
				return await deleteNetwork(input.networkId);
			} catch (error) {
				handleTRPCError(
					error,
					"Failed to delete network",
					"Error deleting network:",
				);
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
			await verifyNetworkAccess(
				input.networkId,
				ctx.session.activeOrganizationId,
			);

			try {
				return await assignNetworkToResource(
					input.networkId,
					input.resourceId,
					input.resourceType,
				);
			} catch (error) {
				handleTRPCError(
					error,
					"Failed to assign network to resource",
					"Error assigning network to resource:",
				);
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
			await verifyNetworkAccess(
				input.networkId,
				ctx.session.activeOrganizationId,
			);

			try {
				return await removeNetworkFromResource(
					input.networkId,
					input.resourceId,
					input.resourceType,
				);
			} catch (error) {
				handleTRPCError(
					error,
					"Failed to remove network from resource",
					"Error removing network from resource:",
				);
			}
		}),

	getResourceNetworks: protectedProcedure
		.input(
			z.object({
				resourceId: z.string().min(1),
				resourceType: RESOURCE_TYPE_WITH_PREVIEW_ENUM,
			}),
		)
		.query(async ({ input }) => {
			return await getResourceNetworks(input.resourceId, input.resourceType);
		}),

	getResourceNetworksForDomain: protectedProcedure
		.input(
			z.object({
				resourceId: z.string().min(1),
				resourceType: RESOURCE_TYPE_WITH_PREVIEW_ENUM,
			}),
		)
		.query(async ({ input }) => {
			const resource = await findResourceById(
				input.resourceId,
				input.resourceType,
			);

			let customNetworkIds: string[];
			if (input.resourceType === "preview") {
				const previewResource = resource as any;
				customNetworkIds = Array.from(
					previewResource.application?.previewNetworkIds ||
						previewResource.application?.customNetworkIds ||
						[],
				);
			} else {
				customNetworkIds = Array.from(resource.customNetworkIds || []);
			}

			const networks = await getResourceNetworks(
				input.resourceId,
				input.resourceType,
			);

			// Filter out internal networks - Traefik cannot connect to internal networks
			const availableNetworks = networks.filter((network) => !network.internal);

			// If resource has no custom networks, dokploy-network is available by default
			// Return a special "default" entry that will be converted to null in the frontend
			if (customNetworkIds.length === 0) {
				return [
					{
						networkId: "default",
						name: "Default",
						networkName: "dokploy-network",
						description: "Default Dokploy network",
						driver: "bridge" as const,
						internal: false,
						encrypted: false,
						subnet: null,
						gateway: null,
						ipRange: null,
						organizationId: "",
						projectId: null,
						serverId: null,
						dockerNetworkId: null,
						createdAt: new Date().toISOString(),
					},
					...availableNetworks,
				];
			}

			// If resource has custom networks, only show those
			return availableNetworks;
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

	getAllNetworksByServer: protectedProcedure
		.input(
			z.object({
				serverId: z.string().nullable(),
				resourceType: z.enum(["application", "compose"]),
				composeType: z.enum(["docker-compose", "stack"]).optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getAllNetworksByServer(
				input.serverId,
				input.resourceType,
				input.composeType,
			);
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

	importOrphanedNetworks: protectedProcedure
		.input(
			z.object({
				serverId: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return await importOrphanedNetworks(input.serverId);
			} catch (error) {
				handleTRPCError(
					error,
					"Failed to import orphaned networks",
					"Error importing orphaned networks:",
				);
			}
		}),
});
