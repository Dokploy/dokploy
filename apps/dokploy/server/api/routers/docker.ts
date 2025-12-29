import {
	containerRestart,
	findServerById,
	getConfig,
	getContainers,
	getContainersByAppLabel,
	getContainersByAppNameMatch,
	getServiceContainersByAppName,
	getStackContainersByAppName,
} from "@dokploy/server";
import { validateContainerId } from "@dokploy/server/utils/security/shell-escape";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Legacy regex for app names (not container IDs)
export const containerIdRegex = /^[a-zA-Z0-9.\-_]+$/;

// Zod schema for validating Docker container IDs
const containerIdSchema = z
	.string()
	.min(1)
	.refine(
		(id) => validateContainerId(id),
		{
			message: "Invalid container ID format. Must be 12-64 hexadecimal characters.",
		},
	);

export const dockerRouter = createTRPCRouter({
	getContainers: protectedProcedure
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
			return await getContainers(input.serverId);
		}),

	restartContainer: protectedProcedure
		.input(
			z.object({
				containerId: containerIdSchema,
			}),
		)
		.mutation(async ({ input }) => {
			return await containerRestart(input.containerId);
		}),

	getConfig: protectedProcedure
		.input(
			z.object({
				containerId: containerIdSchema,
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
			return await getConfig(input.containerId, input.serverId);
		}),

	getContainersByAppNameMatch: protectedProcedure
		.input(
			z.object({
				appType: z
					.union([z.literal("stack"), z.literal("docker-compose")])
					.optional(),
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
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
			return await getContainersByAppNameMatch(
				input.appName,
				input.appType,
				input.serverId,
			);
		}),

	getContainersByAppLabel: protectedProcedure
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
				serverId: z.string().optional(),
				type: z.enum(["standalone", "swarm"]),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await getContainersByAppLabel(
				input.appName,
				input.type,
				input.serverId,
			);
		}),

	getStackContainersByAppName: protectedProcedure
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
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
			return await getStackContainersByAppName(input.appName, input.serverId);
		}),

	getServiceContainersByAppName: protectedProcedure
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
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
			return await getServiceContainersByAppName(input.appName, input.serverId);
		}),
});
