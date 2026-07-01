import {
	execAsync,
	execAsyncRemote,
	findAllDeploymentsByApplicationId,
	findAllDeploymentsByComposeId,
	findAllDeploymentsByServerId,
	findAllDeploymentsCentralized,
	findDeploymentById,
	getAccessibleServerIds,
	IS_CLOUD,
	removeDeployment,
	resolveServicePath,
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	checkPermission,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { redactRollbackFullContextSecrets } from "@dokploy/server/utils/security/redaction";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { assertTargetServerAccess } from "@/server/api/utils/placement-access";
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

type DeploymentPermissionAction = "cancel" | "read";
type DeploymentOwnerCandidate = {
	applicationId?: string | null;
	backup?: {
		composeId?: string | null;
		libsqlId?: string | null;
		mariadbId?: string | null;
		mongoId?: string | null;
		mysqlId?: string | null;
		postgresId?: string | null;
	} | null;
	composeId?: string | null;
	previewDeployment?: {
		applicationId?: string | null;
	} | null;
	serverId?: string | null;
	schedule?: {
		serverId?: string | null;
	} | null;
	volumeBackup?: {
		applicationId?: string | null;
		composeId?: string | null;
		libsqlId?: string | null;
		mariadbId?: string | null;
		mongoId?: string | null;
		mysqlId?: string | null;
		postgresId?: string | null;
		redisId?: string | null;
	} | null;
};

const getBackupServiceId = (backup: DeploymentOwnerCandidate["backup"]) =>
	backup?.composeId ||
	backup?.postgresId ||
	backup?.mariadbId ||
	backup?.mysqlId ||
	backup?.mongoId ||
	backup?.libsqlId ||
	null;

const getVolumeBackupServiceId = (
	volumeBackup: DeploymentOwnerCandidate["volumeBackup"],
) =>
	volumeBackup?.applicationId ||
	volumeBackup?.composeId ||
	volumeBackup?.postgresId ||
	volumeBackup?.mysqlId ||
	volumeBackup?.mariadbId ||
	volumeBackup?.mongoId ||
	volumeBackup?.redisId ||
	volumeBackup?.libsqlId ||
	null;

const getDeploymentServiceId = (deployment: DeploymentOwnerCandidate) =>
	deployment.applicationId ||
	deployment.composeId ||
	deployment.previewDeployment?.applicationId ||
	getBackupServiceId(deployment.backup) ||
	getVolumeBackupServiceId(deployment.volumeBackup);

const assertDeploymentActionAccess = async (
	ctx: Parameters<typeof assertTargetServerAccess>[0],
	deployment: DeploymentOwnerCandidate,
	action: DeploymentPermissionAction,
) => {
	const serviceId = getDeploymentServiceId(deployment);
	if (serviceId) {
		await checkServicePermissionAndAccess(ctx, serviceId, {
			deployment: [action],
		});
		return;
	}

	const deploymentServerId =
		deployment.serverId || deployment.schedule?.serverId;
	if (deploymentServerId) {
		await checkPermission(ctx, { deployment: [action] });
		await assertTargetServerAccess(ctx, deploymentServerId);
		return;
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "You are not authorized to access this deployment",
	});
};

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
			await assertTargetServerAccess(ctx, input.serverId);
			return await findAllDeploymentsByServerId(input.serverId);
		}),
	allCentralized: withPermission("deployment", "read").query(
		async ({ ctx }) => {
			const orgId = ctx.session.activeOrganizationId;
			const accessedServices =
				ctx.user.role !== "owner" && ctx.user.role !== "admin"
					? (await findMemberByUserId(ctx.user.id, orgId)).accessedServices
					: null;
			if (accessedServices !== null && accessedServices.length === 0) {
				return [];
			}
			return findAllDeploymentsCentralized(orgId, accessedServices);
		},
	),

	queueList: withPermission("deployment", "read").query(async ({ ctx }) => {
		const orgId = ctx.session.activeOrganizationId;
		let rows: QueueJobRow[];

		if (IS_CLOUD) {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			const servers = await db.query.server.findMany({
				where: eq(server.organizationId, orgId),
				columns: { serverId: true },
			});
			const serverRowsArrays = await Promise.all(
				servers
					.filter(({ serverId }) => accessibleIds.has(serverId))
					.map(({ serverId }) => fetchDeployApiJobs(serverId)),
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

		const rowsWithServicePath = await Promise.all(
			rows.map(async (row) => {
				const servicePath = await resolveServicePath(
					orgId,
					(row.data ?? {}) as Record<string, unknown>,
				);
				return {
					...row,
					servicePath,
				};
			}),
		);

		if (IS_CLOUD) {
			return rowsWithServicePath;
		}

		return rowsWithServicePath.filter((row) => row.servicePath.href !== null);
	}),

	allByType: protectedProcedure
		.input(apiFindAllByType)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.id, {
				deployment: ["read"],
			});
			const deploymentsList = await db.query.deployments.findMany({
				where: eq(deployments[`${input.type}Id`], input.id),
				orderBy: desc(deployments.createdAt),
				with: {
					rollback: true,
				},
			});
			return deploymentsList.map((deployment) => ({
				...deployment,
				rollback: deployment.rollback
					? {
							...deployment.rollback,
							fullContext: redactRollbackFullContextSecrets(
								deployment.rollback.fullContext,
							),
						}
					: deployment.rollback,
			}));
		}),
	killProcess: protectedProcedure
		.input(
			z.object({
				deploymentId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const deployment = await findDeploymentById(input.deploymentId);
			const deploymentServerId =
				deployment.serverId || deployment.schedule?.serverId;
			await assertDeploymentActionAccess(ctx, deployment, "cancel");

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
			await assertDeploymentActionAccess(ctx, deployment, "cancel");
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
			const deploymentServerId =
				deployment.serverId || deployment.schedule?.serverId;
			await assertDeploymentActionAccess(ctx, deployment, "read");

			if (!deployment.logPath) {
				return "";
			}

			const command = `tail -n ${input.tail} "${deployment.logPath}" 2>/dev/null || echo ""`;
			if (deploymentServerId) {
				const { stdout } = await execAsyncRemote(deploymentServerId, command);
				return stdout;
			}

			if (IS_CLOUD) {
				return "";
			}

			const { stdout } = await execAsync(command);
			return stdout;
		}),
});
