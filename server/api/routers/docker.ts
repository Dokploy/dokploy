import { z } from "zod";
import {
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
