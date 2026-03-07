import {
	connectContainerToNetwork,
	createNetwork,
	disconnectContainerFromNetwork,
	findServerById,
	getNetworkDetails,
	getNetworks,
	removeNetwork,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const networkRouter = createTRPCRouter({
	getAll: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await getNetworks(input.serverId);
		}),

	getById: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1, "Network ID is required"),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await getNetworkDetails(input.networkId, input.serverId);
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z
					.string()
					.min(1, "Network name is required")
					.refine(
						(name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name),
						"Network name must start with a letter or number and contain only letters, numbers, underscores, periods, and hyphens",
					),
				driver: z
					.enum(["bridge", "host", "overlay", "macvlan", "none"])
					.default("bridge"),
				options: z.record(z.string(), z.string()).optional().default({}),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			try {
				const networkId = await createNetwork(
					input.name,
					input.driver,
					input.options,
					input.serverId,
				);
				return {
					networkId,
					message: `Network ${input.name} created successfully`,
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to create network: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				});
			}
		}),

	remove: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1, "Network ID is required"),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			try {
				await removeNetwork(input.networkId, input.serverId);
				return {
					message: "Network removed successfully",
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to remove network: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				});
			}
		}),

	connectContainer: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1, "Network ID is required"),
				containerId: z.string().min(1, "Container ID is required"),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			try {
				await connectContainerToNetwork(
					input.networkId,
					input.containerId,
					input.serverId,
				);
				return {
					message: "Container connected to network successfully",
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to connect container to network: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				});
			}
		}),

	disconnectContainer: protectedProcedure
		.input(
			z.object({
				networkId: z.string().min(1, "Network ID is required"),
				containerId: z.string().min(1, "Container ID is required"),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			try {
				await disconnectContainerFromNetwork(
					input.networkId,
					input.containerId,
					input.serverId,
				);
				return {
					message: "Container disconnected from network successfully",
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Failed to disconnect container from network: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				});
			}
		}),
});
