import {
	findServerById,
	getAllContainerStats,
	getApplicationInfo,
	getNodeApplications,
	getNodeInfo,
	getSwarmNodes,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../trpc";
import { containerIdRegex } from "./docker";

export const swarmRouter = createTRPCRouter({
	getNodes: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "Get Swarm nodes",
				description: "Retrieves all nodes in the Docker Swarm. Optionally targets a remote server by ID.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getSwarmNodes(input.serverId);
		}),
	getNodeInfo: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "Get Swarm node info",
				description: "Retrieves detailed information about a specific Docker Swarm node by its node ID. Optionally targets a remote server.",
			},
		})
		.input(z.object({ nodeId: z.string(), serverId: z.string().optional() }))
		.query(async ({ input }) => {
			return await getNodeInfo(input.nodeId, input.serverId);
		}),
	getNodeApps: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "Get Swarm node applications",
				description: "Retrieves all applications (services) running across Docker Swarm nodes. Optionally targets a remote server.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return getNodeApplications(input.serverId);
		}),
	getAppInfos: withPermission("server", "read")
		.meta({
			openapi: {
				path: "/drop-deployment",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(
			z.object({
				appName: z
					.string()
					.min(1)
					.regex(containerIdRegex, "Invalid app name.")
					.array(),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getApplicationInfo(input.appName, input.serverId);
		}),
	getContainerStats: withPermission("server", "read")
		.meta({
			openapi: {
				summary: "Get container stats",
				description: "Retrieves resource usage statistics for all containers. Optionally targets a remote server and validates organization access.",
			},
		})
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
			return await getAllContainerStats(input.serverId);
		}),
});
