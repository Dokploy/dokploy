import {
	createNetwork,
	findNetworkById,
	findNetworksByOrganizationId,
	findResourcesUsingNetwork,
	getNetworkErrorMessage,
	isDuplicateNetworkNameError,
	removeNetworkById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateNetwork,
	apiFindOneNetwork,
	apiRemoveNetwork,
} from "@/server/db/schema";

export const networkRouter = createTRPCRouter({
	all: withPermission("network", "read").query(async ({ ctx }) =>
		findNetworksByOrganizationId(ctx.session.activeOrganizationId),
	),

	one: withPermission("network", "read")
		.input(apiFindOneNetwork)
		.query(async ({ ctx, input }) =>
			findNetworkById(input.networkId, ctx.session.activeOrganizationId),
		),

	create: withPermission("network", "create")
		.input(apiCreateNetwork)
		.mutation(async ({ ctx, input }) => {
			try {
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
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				const message = getNetworkErrorMessage(error);
				if (isDuplicateNetworkNameError(error)) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `A network named "${input.name}" already exists on this server`,
						cause: error,
					});
				}
				if (
					typeof (error as { code?: unknown }).code === "string" &&
					(error as { code: string }).code === "BAD_REQUEST"
				) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: message || "Error creating the network",
						cause: error,
					});
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the network",
					cause: error,
				});
			}
		}),

	usage: withPermission("network", "read")
		.input(apiFindOneNetwork)
		.query(async ({ ctx, input }) =>
			findResourcesUsingNetwork(
				input.networkId,
				ctx.session.activeOrganizationId,
			),
		),

	remove: withPermission("network", "delete")
		.input(apiRemoveNetwork)
		.mutation(async ({ ctx, input }) => {
			const deleted = await removeNetworkById(
				input.networkId,
				ctx.session.activeOrganizationId,
			);
			if (deleted) {
				await audit(ctx, {
					action: "delete",
					resourceType: "network",
					resourceId: deleted.networkId,
					resourceName: deleted.name,
				});
			}
			return deleted;
		}),
});
