import {
	containerRestart,
	getConfig,
	getContainers,
	getContainersByAppLabel,
	getContainersByAppNameMatch,
} from "@dokploy/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const dockerRouter = createTRPCRouter({
	getContainers: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getContainers(input.serverId);
		}),

	restartContainer: protectedProcedure
		.input(
			z.object({
				containerId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			return await containerRestart(input.containerId);
		}),

	getConfig: protectedProcedure
		.input(
			z.object({
				containerId: z.string().min(1),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getConfig(input.containerId, input.serverId);
		}),

	getContainersByAppNameMatch: protectedProcedure
		.input(
			z.object({
				appType: z
					.union([z.literal("stack"), z.literal("docker-compose")])
					.optional(),
				appName: z.string().min(1),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getContainersByAppNameMatch(
				input.appName,
				input.appType,
				input.serverId,
			);
		}),

	getContainersByAppLabel: protectedProcedure
		.input(
			z.object({
				appName: z.string().min(1),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			return await getContainersByAppLabel(input.appName, input.serverId);
		}),
});
