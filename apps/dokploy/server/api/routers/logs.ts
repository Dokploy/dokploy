import {
	findDeploymentById,
	findServerById,
} from "@dokploy/server";
import {
	readDeploymentLogs,
	readContainerLogs,
} from "@dokploy/server/utils/logs/read-logs";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const logsRouter = createTRPCRouter({
	getDeploymentLogs: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
				tail: z.number().optional(),
				follow: z.boolean().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);

			// Check authorization based on deployment type
			let serverId: string | null = null;
			if (deployment.applicationId) {
				const application = await import("@dokploy/server/services/application").then(
					(m) => m.findApplicationById(deployment.applicationId!),
				);
				if (
					application.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this deployment",
					});
				}
				serverId = application.serverId;
			} else if (deployment.composeId) {
				const compose = await import("@dokploy/server/services/compose").then(
					(m) => m.findComposeById(deployment.composeId!),
				);
				if (
					compose.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this deployment",
					});
				}
				serverId = compose.serverId;
			} else if (deployment.serverId) {
				const server = await findServerById(deployment.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this deployment",
					});
				}
				serverId = deployment.serverId;
			} else if (deployment.previewDeploymentId) {
				const previewDeployment = await import(
					"@dokploy/server/services/preview-deployment"
				).then((m) => m.findPreviewDeploymentById(deployment.previewDeploymentId!));
				if (
					previewDeployment.application?.environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this deployment",
					});
				}
				serverId = previewDeployment.application?.serverId || null;
			}

			try {
				const logs = await readDeploymentLogs(
					deployment.logPath,
					serverId,
					{
						tail: input.tail,
						follow: input.follow,
					},
				);
				return logs;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to read deployment logs",
				});
			}
		}),

	getContainerLogs: protectedProcedure
		.input(
			z.object({
				containerId: z.string().min(1),
				serverId: z.string().optional(),
				tail: z.number().optional(),
				since: z.string().optional(),
				runType: z.enum(["swarm", "native"]).optional(),
				follow: z.boolean().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}

			try {
				const logs = await readContainerLogs(
					input.containerId,
					input.serverId || null,
					{
						tail: input.tail,
						since: input.since,
						runType: input.runType,
						follow: input.follow,
					},
				);
				return logs;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to read container logs",
				});
			}
		}),
});

