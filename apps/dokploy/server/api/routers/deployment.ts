import {
	countDeploymentsCentralized,
	execAsync,
	execAsyncRemote,
	findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId,
	findAllDeploymentsByServerId,
	findAllDeploymentsCentralized,
	findDeploymentById,
	findScheduleById,
	IS_CLOUD,
	removeDeployment,
	resolveServicePath,
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { findServerById } from "@dokploy/server/services/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiFindAllByApplication,
	apiFindAllByCompose,
	apiFindAllByServer,
	apiFindAllByType,
	deployments,
	server,
} from "@/server/db/schema";
import { myQueue } from "@/server/queues/queueSetup";
import { fetchDeployApiJobs, type QueueJobRow } from "@/server/utils/deploy";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

export const deploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["read"],
			});
			return await findAllDeploymentsByApplicationId(input.applicationId);
		}),

	allByCompose: protectedProcedure
		.input(apiFindAllByCompose)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["read"],
			});
			return await findAllDeploymentsByComposeId(input.composeId);
		}),
	allByServer: withPermission("deployment", "read")
		.input(apiFindAllByServer)
		.query(async ({ input, ctx }) => {
			const targetServer = await findServerById(input.serverId);
			if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this server.",
				});
			}
			return await findAllDeploymentsByServerId(input.serverId);
		}),
	allCentralized: withPermission("deployment", "read")
		.input(
			z
				.object({
					limit: z.number().min(1).max(500).optional(),
					status: z.enum(["running", "done", "error", "cancelled"]).optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const orgId = ctx.session.activeOrganizationId;
			const accessedServices =
				ctx.user.role !== "owner" && ctx.user.role !== "admin"
					? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
					: null;
			if (accessedServices !== null && accessedServices.length === 0) {
				return [];
			}
			return findAllDeploymentsCentralized(orgId, accessedServices, {
				limit: input?.limit,
				status: input?.status,
			});
		}),

	homeSummary: withPermission("deployment", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		const accessedServices =
			ctx.user.role !== "owner" && ctx.user.role !== "admin"
				? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
				: null;

		const now = Date.now();
		const weekMs = 7 * 24 * 60 * 60 * 1000;
		const last7dStart = new Date(now - weekMs);
		const prev7dStart = new Date(now - 2 * weekMs);

		const [recent, failed, last7d, prev7d, failed7d, runningCount] =
			await Promise.all([
				findAllDeploymentsCentralized(orgId, accessedServices, { limit: 10 }),
				findAllDeploymentsCentralized(orgId, accessedServices, {
					limit: 5,
					status: "error",
					since: last7dStart,
				}),
				countDeploymentsCentralized(orgId, accessedServices, {
					since: last7dStart,
				}),
				countDeploymentsCentralized(orgId, accessedServices, {
					since: prev7dStart,
					until: last7dStart,
				}),
				countDeploymentsCentralized(orgId, accessedServices, {
					status: "error",
					since: last7dStart,
				}),
				countDeploymentsCentralized(orgId, accessedServices, {
					status: "running",
				}),
			]);

		return {
			recent,
			failed,
			stats: {
				last7d,
				prev7d,
				failed7d,
				running: runningCount,
			},
		};
	}),

	queueList: withPermission("deployment", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		let rows: QueueJobRow[];

		if (IS_CLOUD) {
			const servers = await db.query.server.findMany({
				where: eq(server.organizationId, orgId),
				columns: { serverId: true },
			});
			const serverRowsArrays = await Promise.all(
				servers.map(({ serverId }) => fetchDeployApiJobs(serverId)),
			);
			rows = serverRowsArrays.flat();
			rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
		} else {
			const jobs = await myQueue.getJobs();
			const jobRows = await Promise.all(
				jobs.map(async (job) => {
					const state = await job.getState();
					return {
						id: String(job.id),
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
			jobRows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
			rows = jobRows;
		}

		return Promise.all(
			rows.map(async (row) => ({
				...row,
				servicePath: await resolveServicePath(
					orgId,
					(row.data ?? {}) as Record<string, unknown>,
				),
			})),
		);
	}),

	allByType: protectedProcedure
		.input(apiFindAllByType)
		.query(async ({ input, ctx }) => {
			if (input.type === "schedule") {
				const schedule = await findScheduleById(input.id);
				const serviceId = schedule.applicationId || schedule.composeId;
				if (serviceId) {
					await checkServicePermissionAndAccess(ctx, serviceId, {
						deployment: ["read"],
					});
				} else if (schedule.serverId) {
					const targetServer = await findServerById(schedule.serverId);
					if (
						targetServer.organizationId !== ctx.session.activeOrganizationId
					) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this schedule.",
						});
					}
				}
			} else {
				await checkServicePermissionAndAccess(ctx, input.id, {
					deployment: ["read"],
				});
			}
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
		.mutation(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);
			const serviceId = deployment.applicationId || deployment.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					deployment: ["cancel"],
				});
			} else if (deployment.schedule?.serverId) {
				const targetServer = await findServerById(deployment.schedule.serverId);
				if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this deployment.",
					});
				}
			}

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
			await audit(ctx, {
				action: "cancel",
				resourceType: "deployment",
				resourceId: deployment.deploymentId,
			});
		}),

	removeDeployment: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);
			const serviceId = deployment.applicationId || deployment.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					deployment: ["cancel"],
				});
			} else if (deployment.schedule?.serverId) {
				const targetServer = await findServerById(deployment.schedule.serverId);
				if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this deployment.",
					});
				}
			}
			const result = await removeDeployment(input.deploymentId);
			await audit(ctx, {
				action: "delete",
				resourceType: "deployment",
				resourceId: deployment.deploymentId,
			});
			return result;
		}),

	readLogs: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
				tail: z.number().int().min(1).max(10000).default(100),
			}),
		)
		.query(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);
			const serviceId = deployment.applicationId || deployment.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					deployment: ["read"],
				});
			} else if (deployment.schedule?.serverId) {
				const targetServer = await findServerById(deployment.schedule.serverId);
				if (targetServer.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this deployment.",
					});
				}
			}

			if (!deployment.logPath) {
				return "";
			}

			const command = `tail -n ${input.tail} "${deployment.logPath}" 2>/dev/null || echo ""`;
			const serverId =
				deployment.serverId ||
				deployment.schedule?.serverId ||
				deployment.application?.serverId ||
				deployment.compose?.serverId;
			if (serverId) {
				const { stdout } = await execAsyncRemote(serverId, command);
				return stdout;
			}

			if (IS_CLOUD) {
				return "";
			}

			const { stdout } = await execAsync(command);
			return stdout;
		}),
});
