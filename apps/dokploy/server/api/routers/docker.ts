import {
	containerKill,
	containerRemove,
	containerRestart,
	containerStart,
	containerStop,
	getAccessibleServerIds,
	getConfig,
	getContainers,
	getContainersByAppLabel,
	getContainersByAppNameMatch,
	getServiceContainersByAppName,
	getStackContainersByAppName,
	uploadFileToContainer,
} from "@dokploy/server";
import { findMemberByUserId } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	assertLocalDockerContainerAccess,
	assertLocalDockerServiceAccess,
	assertLocalDockerServiceReadAccess,
	type LocalDockerPermission,
} from "@/server/api/utils/local-docker-access";
import { uploadFileToContainerSchema } from "@/utils/schema";
import { createTRPCRouter, withPermission } from "../trpc";

export const containerIdRegex = /^[a-zA-Z0-9.\-_]+$/;

type DockerRouterAccessCtx = {
	session: {
		userId: string;
		activeOrganizationId: string;
	};
	user: {
		id: string;
	};
};

const assertDockerServerAccess = async (
	ctx: DockerRouterAccessCtx,
	serverId?: string,
) => {
	const member = await findMemberByUserId(
		ctx.user.id,
		ctx.session.activeOrganizationId,
	);
	if (member.role !== "owner" && member.role !== "admin") {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Docker host operations require owner or admin access",
		});
	}

	if (!serverId) {
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
};

const assertDockerAppNameServiceReadAccess = async (
	ctx: DockerRouterAccessCtx,
	appName: string,
	serverId?: string,
) => {
	if (serverId) {
		await assertDockerServerAccess(ctx, serverId);
		return;
	}

	await assertLocalDockerServiceReadAccess(ctx, appName);
};

const assertDockerAppNameAccess = async (
	ctx: DockerRouterAccessCtx,
	appName: string,
	serverId: string | undefined,
	permission: LocalDockerPermission,
) => {
	if (serverId) {
		await assertDockerServerAccess(ctx, serverId);
		return;
	}

	await assertLocalDockerServiceAccess(ctx, appName, permission);
};

const assertDockerContainerServerAccess = async (
	ctx: DockerRouterAccessCtx,
	serverId?: string,
) => {
	if (!serverId) {
		return;
	}
	await assertDockerServerAccess(ctx, serverId);
};

const resolveAuthorizedContainerId = async (
	ctx: {
		session: {
			activeOrganizationId: string;
		};
		user: {
			id: string;
		};
	},
	containerId: string,
	serverId: string | undefined,
	permission: LocalDockerPermission,
) => {
	if (serverId) {
		return containerId;
	}

	const config = await assertLocalDockerContainerAccess(
		ctx,
		containerId,
		permission,
	);

	return config?.Id || containerId;
};

export const dockerRouter = createTRPCRouter({
	getContainers: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertDockerServerAccess(ctx, input.serverId);
			return await getContainers(input.serverId);
		}),

	restartContainer: withPermission("docker", "execute")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"execute",
			);
			await containerRestart(containerId, input.serverId);
			await audit(ctx, {
				action: "start",
				resourceType: "docker",
				resourceId: containerId,
				resourceName: containerId,
			});
		}),

	startContainer: withPermission("docker", "execute")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"execute",
			);
			await containerStart(containerId, input.serverId);
			await audit(ctx, {
				action: "start",
				resourceType: "docker",
				resourceId: containerId,
				resourceName: containerId,
			});
		}),

	stopContainer: withPermission("docker", "execute")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"execute",
			);
			await containerStop(containerId, input.serverId);
			await audit(ctx, {
				action: "stop",
				resourceType: "docker",
				resourceId: containerId,
				resourceName: containerId,
			});
		}),

	killContainer: withPermission("docker", "execute")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"execute",
			);
			await containerKill(containerId, input.serverId);
			await audit(ctx, {
				action: "stop",
				resourceType: "docker",
				resourceId: containerId,
				resourceName: containerId,
			});
		}),

	removeContainer: withPermission("docker", "delete")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"delete",
			);
			await containerRemove(containerId, input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: containerId,
				resourceName: containerId,
			});
		}),

	getConfig: withPermission("docker", "inspect")
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
			await assertDockerContainerServerAccess(ctx, input.serverId);
			if (!input.serverId) {
				return await assertLocalDockerContainerAccess(
					ctx,
					input.containerId,
					"inspect",
				);
			}
			return await getConfig(input.containerId, input.serverId);
		}),

	getContainersByAppNameMatch: withPermission("service", "read")
		.input(
			z.object({
				appType: z.enum(["stack", "docker-compose"]).optional(),
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertDockerAppNameServiceReadAccess(
				ctx,
				input.appName,
				input.serverId,
			);
			return await getContainersByAppNameMatch(
				input.appName,
				input.appType,
				input.serverId,
			);
		}),

	getContainersByAppLabel: withPermission("docker", "read")
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
				serverId: z.string().optional(),
				type: z.enum(["standalone", "swarm"]),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertDockerAppNameAccess(
				ctx,
				input.appName,
				input.serverId,
				"read",
			);
			return await getContainersByAppLabel(
				input.appName,
				input.type,
				input.serverId,
			);
		}),

	getStackContainersByAppName: withPermission("docker", "read")
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertDockerAppNameAccess(
				ctx,
				input.appName,
				input.serverId,
				"read",
			);
			return await getStackContainersByAppName(input.appName, input.serverId);
		}),

	getServiceContainersByAppName: withPermission("docker", "read")
		.input(
			z.object({
				appName: z.string().min(1).regex(containerIdRegex, "Invalid app name."),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertDockerAppNameAccess(
				ctx,
				input.appName,
				input.serverId,
				"read",
			);
			return await getServiceContainersByAppName(input.appName, input.serverId);
		}),

	uploadFileToContainer: withPermission("docker", "write")
		.input(uploadFileToContainerSchema)
		.mutation(async ({ input, ctx }) => {
			await assertDockerContainerServerAccess(ctx, input.serverId);
			const containerId = await resolveAuthorizedContainerId(
				ctx,
				input.containerId,
				input.serverId,
				"write",
			);

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
				containerId,
				fileBuffer,
				file.name,
				input.destinationPath,
				input.serverId || null,
			);

			return { success: true, message: "File uploaded successfully" };
		}),
});
