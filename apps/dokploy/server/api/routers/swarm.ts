import {
	getApplicationInfo,
	getNodeApplications,
	getNodeInfo,
	getSwarmNodes,
} from "@dokploy/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const swarmRouter = createTRPCRouter({
	getNodes: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getSwarmNodes(input.serverId);
		}),
	getNodeInfo: protectedProcedure
		.input(z.object({ nodeId: z.string(), serverId: z.string().optional() }))
		.query(async ({ input }) => {
			return await getNodeInfo(input.nodeId, input.serverId);
		}),
	getNodeApps: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return getNodeApplications(input.serverId);
		}),
	getAppInfos: protectedProcedure
		.input(
			z.object({
				appName: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getApplicationInfo(input.appName, input.serverId);
		}),
});
