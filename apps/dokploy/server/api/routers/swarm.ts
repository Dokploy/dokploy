import {
	getApplicationInfo,
	getNodeApplications,
	getNodeInfo,
	getSwarmNodes,
} from "@dokploy/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const swarmRouter = createTRPCRouter({
	getNodes: protectedProcedure.query(async () => {
		return await getSwarmNodes();
	}),
	getNodeInfo: protectedProcedure
		.input(z.object({ nodeId: z.string() }))
		.query(async ({ input }) => {
			return await getNodeInfo(input.nodeId);
		}),
	getNodeApps: protectedProcedure.query(async () => {
		return getNodeApplications();
	}),
	getAppInfos: protectedProcedure
		.input(
			z.object({
				appName: z.string(),
			}),
		)
		.query(async ({ input }) => {
			return await getApplicationInfo(input.appName);
		}),
});
