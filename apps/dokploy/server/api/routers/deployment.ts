import {
	execAsync,
	execAsyncRemote,
	findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId,
	findAllDeploymentsByServerId,
	findAllDeploymentsCentralized,
	findApplicationById,
	findComposeById,
	findDeploymentById,
	findMemberById,
	findServerById,
	removeDeployment,
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	apiFindAllByApplication,
	apiFindAllByCompose,
	apiFindAllByServer,
	apiFindAllByType,
	deployments,
} from "@/server/db/schema";
import { myQueue } from "@/server/queues/queueSetup";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const deploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await findAllDeploymentsByApplicationId(input.applicationId);
		}),

	allByCompose: protectedProcedure
		.input(apiFindAllByCompose)
		.query(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);
			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
			return await findAllDeploymentsByComposeId(input.composeId);
		}),
	allByServer: protectedProcedure
		.input(apiFindAllByServer)
		.query(async ({ input, ctx }) => {
			const server = await findServerById(input.serverId);
			if (server.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this server",
				});
			}
			return await findAllDeploymentsByServerId(input.serverId);
		}),
	allCentralized: protectedProcedure.query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role === "member"
				? (await findMemberById(ctx.user.id, orgId)).accessedServices
				: null;
		if (accessedServices !== null && accessedServices.length === 0) {
			return [];
		}
		return findAllDeploymentsCentralized(orgId, accessedServices);
	}),

	queueList: protectedProcedure.query(async () => {
		const jobs = await myQueue.getJobs();
		const rows = await Promise.all(
			jobs.map(async (job) => {
				const state = await job.getState();
				console.log(job.data);
				return {
					id: job.id,
					name: job.name ?? undefined,
					data: job.data as Record<string, unknown>,
					timestamp: job.timestamp,
					processedOn: job.processedOn,
					finishedOn: job.finishedOn,
					failedReason: job.failedReason ?? undefined,
					state,
				};
			}),
		);
		rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
		return rows;
	}),

	allByType: protectedProcedure
		.input(apiFindAllByType)
		.query(async ({ input }) => {
			const deploymentsList = await db.query.deployments.findMany({
				where: eq(deployments[`${input.type}Id`], input.id),
				orderBy: desc(deployments.createdAt),
				with: {
					rollback: true,
				},
			});

			return deploymentsList;
		}),

	killProcess: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const deployment = await findDeploymentById(input.deploymentId);

			if (!deployment.pid) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Deployment is not running",
				});
			}

			const command = `kill -9 ${deployment.pid}`;
			if (deployment.schedule?.serverId) {
				await execAsyncRemote(deployment.schedule.serverId, command);
			} else {
				await execAsync(command);
			}

			await updateDeploymentStatus(deployment.deploymentId, "error");
		}),

	removeDeployment: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			return await removeDeployment(input.deploymentId);
		}),
});
