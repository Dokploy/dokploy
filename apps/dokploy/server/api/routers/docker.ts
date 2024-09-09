import { z } from "zod";
import {
	containerRestart,
	getConfig,
	getContainers,
	getContainersByAppLabel,
	getContainersByAppNameMatch,
} from "../services/docker";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const dockerRouter = createTRPCRouter({
	getContainers: protectedProcedure.query(async () => {
		return await getContainers();
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
			}),
		)
		.query(async ({ input }) => {
			return await getConfig(input.containerId);
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
			}),
		)
		.query(async ({ input }) => {
			return await getContainersByAppLabel(input.appName);
		}),
});
