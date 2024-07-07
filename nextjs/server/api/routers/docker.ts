import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
	getConfig,
	getContainersByAppLabel,
	getContainers,
	getContainersByAppNameMatch,
} from "../services/docker";

export const dockerRouter = createTRPCRouter({
	getContainers: protectedProcedure.query(async () => {
		return await getContainers();
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
				appName: z.string().min(1),
			}),
		)
		.query(async ({ input }) => {
			return await getContainersByAppNameMatch(input.appName);
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
