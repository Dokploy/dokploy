import {
	containerRemove,
	containerRestart,
	findServerById,
	getConfig,
	getContainers,
	getContainersByAppLabel,
	getContainersByAppNameMatch,
	getServiceContainersByAppName,
	getStackContainersByAppName,
	uploadFileToContainer,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { uploadFileToContainerSchema } from "@/utils/schema";
import { createTRPCRouter, withPermission } from "../trpc";

export const containerIdRegex = /^[a-zA-Z0-9.\-_]+$/;

export const dockerRouter = createTRPCRouter({
	getContainers: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Get Docker containers",
				description: "Retrieves a list of all Docker containers. Optionally targets a specific remote server by ID.",
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
			return await getContainers(input.serverId);
		}),

	restartContainer: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Restart a Docker container",
				description: "Restarts a Docker container by its ID. An audit log entry is created for the action.",
			},
		})
		.input(
			z.object({
				containerId: z
					.string()
					.min(1)
					.regex(containerIdRegex, "Invalid container id."),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const result = await containerRestart(input.containerId);
			await audit(ctx, {
				action: "start",
				resourceType: "docker",
				resourceId: input.containerId,
				resourceName: input.containerId,
			});
			return result;
		}),

	removeContainer: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Remove a Docker container",
				description: "Removes a Docker container by its ID. Optionally targets a remote server. An audit log entry is created for the deletion.",
			},
		})
		.input(
			z.object({
				containerId: z
					.string()
					.min(1)
					.regex(containerIdRegex, "Invalid container id."),
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
			await containerRemove(input.containerId, input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: input.containerId,
				resourceName: input.containerId,
			});
		}),

	getConfig: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Get Docker container configuration",
				description: "Retrieves the configuration (inspect data) for a specific Docker container. Optionally targets a remote server.",
			},
		})
		.input(
			z.object({
				containerId: z
					.string()
					.min(1)
					.regex(containerIdRegex, "Invalid container id."),
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

	getContainersByAppNameMatch: withPermission("service", "read")
		.meta({
			openapi: {
				summary: "Get containers by app name match",
				description: "Retrieves containers whose names match the given application name. Supports filtering by app type (stack or docker-compose) and optionally targets a remote server.",
			},
		})
		.input(
			z.object({
				appType: z.enum(["stack", "docker-compose"]).optional(),
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

	getContainersByAppLabel: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Get containers by app label",
				description: "Retrieves containers filtered by application label. Supports standalone and swarm deployment types, and optionally targets a remote server.",
			},
		})
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

	getStackContainersByAppName: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Get stack containers by app name",
				description: "Retrieves all containers belonging to a Docker stack by application name. Optionally targets a remote server.",
			},
		})
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

	getServiceContainersByAppName: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Get service containers by app name",
				description: "Retrieves all containers belonging to a Docker Swarm service by application name. Optionally targets a remote server.",
			},
		})
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

	uploadFileToContainer: withPermission("docker", "read")
		.meta({
			openapi: {
				summary: "Upload a file to a Docker container",
				description: "Uploads a file to a specified path inside a Docker container. The file is converted to a buffer and transferred to the container's filesystem.",
			},
		})
		.input(uploadFileToContainerSchema)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			const file = input.file;
			if (!(file instanceof File)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid file provided",
				});
			}

			// Convert File to Buffer
			const arrayBuffer = await file.arrayBuffer();
			const fileBuffer = Buffer.from(arrayBuffer);

			await uploadFileToContainer(
				input.containerId,
				fileBuffer,
				file.name,
				input.destinationPath,
				input.serverId || null,
			);

			return { success: true, message: "File uploaded successfully" };
		}),
});
