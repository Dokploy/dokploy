import {
	checkStackCompatibility,
	findApplicationById,
	findAutoscalingPolicy,
	findComposeById,
	findScalingEvents,
	getApplicationCapacity,
	getApplicationMetrics,
	getCachedApplicationScalingStatus,
	getCachedComposeScalingStatus,
	getComposeServiceMetrics,
	getControllerStatus,
	getScalingSettings,
	getServiceMode,
	getStackServiceCapacity,
	IS_CLOUD,
	installTaskMetricsAgent,
	listPlacementNodes,
	readComposeSpecForSwitch,
	ScaleRejectedError,
	ScalingServerUnavailableError,
	saveAutoscalingPolicy,
	setApplicationReplicas,
	setComposeServiceReplicas,
	settingsOf,
	stackServiceName,
	switchComposeToStack,
	updateComposeServicePlacement,
	updatePlacementSettings,
	updateRolloutSettings,
} from "@dokploy/server";
import {
	checkPermission,
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { createSlidingWindowLimiter } from "@dokploy/server/services/scaling/rate-limit";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	type AutoscalingTarget,
	apiFindAutoscaling,
	apiFindCapacity,
	apiFindComposeCapacity,
	apiFindComposeScaling,
	apiFindComposeScalingEvents,
	apiFindComposeScalingMetrics,
	apiFindScalingEvents,
	apiFindScalingMetrics,
	apiFindScalingStatus,
	apiSetComposeReplicas,
	apiSetReplicas,
	apiSwitchComposeToStack,
	apiUpdateAutoscaling,
	apiUpdateComposePlacement,
	apiUpdatePlacement,
	apiUpdateRollout,
} from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";

const manualScaleLimiter = createSlidingWindowLimiter({
	limit: 10,
	windowMs: 60_000,
});
const composeScaleLimiter = createSlidingWindowLimiter({
	limit: 10,
	windowMs: 60_000,
});

const canReadDocker = async (
	ctx: Parameters<typeof checkPermission>[0],
): Promise<boolean> => {
	try {
		await checkPermission(ctx, { docker: ["read"] });
		return true;
	} catch {
		return false;
	}
};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const toTRPCError = (error: unknown, fallback: string) => {
	if (error instanceof TRPCError) return error;
	if (error instanceof ScaleRejectedError) {
		return new TRPCError({
			code:
				error.reason === "replicas_changed"
					? "CONFLICT"
					: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	if (error instanceof ScalingServerUnavailableError) {
		return new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
		});
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `${fallback}: ${errorMessage(error)}`,
		cause: error,
	});
};

const targetId = (target: AutoscalingTarget) =>
	target.kind === "application" ? target.applicationId : target.composeId;

/** Reasons the target cannot be autoscaled at all, checked when it is turned on. */
const autoscalingUnsupported = async (target: AutoscalingTarget) => {
	if (target.kind === "application") {
		const application = await findApplicationById(target.applicationId);
		const mode = getServiceMode(application.modeSwarm);
		return mode === "replicated"
			? null
			: `Autoscaling needs a replicated service; this application runs in ${mode} mode.`;
	}
	const compose = await findComposeById(target.composeId);
	if (compose.command) {
		return "This compose deploys with a custom command, so Dokploy cannot scale it.";
	}
	const status = await getCachedComposeScalingStatus(compose);
	const service = status.services.find(
		(candidate) => candidate.serviceName === target.serviceName,
	);
	if (!service)
		return `The compose has no service named ${target.serviceName}.`;
	if (service.mode !== "replicated") {
		return `Autoscaling needs a replicated service; ${target.serviceName} runs in ${service.mode} mode.`;
	}
	if (service.singleInstanceReasons.length > 0) {
		return `${target.serviceName} can run only one container: ${service.singleInstanceReasons.join(", ")}.`;
	}
	return null;
};

export const scalingRouter = createTRPCRouter({
	status: protectedProcedure
		.input(apiFindScalingStatus)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
			});
			const application = await findApplicationById(input.applicationId);
			try {
				return await getCachedApplicationScalingStatus(application);
			} catch (error) {
				throw toTRPCError(error, "Unable to read the replica status");
			}
		}),

	setReplicas: protectedProcedure
		.input(apiSetReplicas)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			if (!manualScaleLimiter.tryConsume(input.applicationId)) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message:
						"Too many scaling requests for this application. Wait a minute and try again.",
				});
			}
			const application = await findApplicationById(input.applicationId);
			try {
				const result = await setApplicationReplicas({
					application,
					replicas: input.replicas,
					userId: ctx.user.id,
					acknowledgeWarnings: input.acknowledgeWarnings,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "application",
					resourceId: application.applicationId,
					resourceName: application.appName,
					metadata: { replicas: { from: result.from, to: result.to } },
				});
				return result;
			} catch (error) {
				throw toTRPCError(error, "Error scaling the application");
			}
		}),

	capacity: protectedProcedure
		.input(apiFindCapacity)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
			});
			const application = await findApplicationById(input.applicationId);
			let capacity: Awaited<ReturnType<typeof getApplicationCapacity>>;
			try {
				capacity = await getApplicationCapacity(application, input.replicas);
			} catch (error) {
				throw toTRPCError(error, "Unable to estimate capacity");
			}
			// Node names, sizes and other services' reservations describe the whole
			// cluster, which elsewhere (cluster.getNodes) requires Docker access.
			return (await canReadDocker(ctx))
				? { ...capacity, nodeDetails: true }
				: { ...capacity, nodes: [], nodeDetails: false };
		}),

	metrics: protectedProcedure
		.input(apiFindScalingMetrics)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
				monitoring: ["read"],
			});
			const application = await findApplicationById(input.applicationId);
			try {
				return await getApplicationMetrics(application, {
					rangeMinutes: input.rangeMinutes,
				});
			} catch (error) {
				throw toTRPCError(error, "Unable to read replica metrics");
			}
		}),

	setupMetricsAgent: protectedProcedure
		.input(apiFindScalingStatus)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "The metrics agent is managed by Dokploy Cloud.",
				});
			}
			// The agent runs on every node of the server's swarm, so this is a
			// server change, not an application one.
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
				server: ["create"],
			});
			const application = await findApplicationById(input.applicationId);
			try {
				await installTaskMetricsAgent(application);
			} catch (error) {
				throw toTRPCError(error, "Unable to install the metrics agent");
			}
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: application.serverId ?? undefined,
				resourceName: application.server?.name ?? "Dokploy",
				metadata: { taskMetrics: true },
			});
			return true;
		}),

	settings: protectedProcedure
		.input(apiFindScalingStatus)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
			});
			const application = await findApplicationById(input.applicationId);
			return getScalingSettings(application);
		}),

	updateRollout: protectedProcedure
		.input(apiUpdateRollout)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			const { applicationId, ...settings } = input;
			const application = await findApplicationById(applicationId);
			const rollout = await updateRolloutSettings({
				applicationId,
				settings,
				userId: ctx.user.id,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
				metadata: rollout,
			});
			return true;
		}),

	updatePlacement: protectedProcedure
		.input(apiUpdatePlacement)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			const { applicationId, ...selection } = input;
			const application = await findApplicationById(applicationId);
			let placement: Awaited<ReturnType<typeof updatePlacementSettings>>;
			try {
				placement = await updatePlacementSettings({
					application,
					selection,
					userId: ctx.user.id,
				});
			} catch (error) {
				throw toTRPCError(error, "Error saving the placement");
			}
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
				metadata: { placementSwarm: placement },
			});
			return true;
		}),

	// Node names and labels describe the whole cluster, so like the capacity
	// details they need docker:read; without it the card offers no node list.
	placementNodes: protectedProcedure
		.input(apiFindScalingStatus)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
			});
			if (!(await canReadDocker(ctx))) return [];
			const application = await findApplicationById(input.applicationId);
			try {
				return await listPlacementNodes(application);
			} catch (error) {
				throw toTRPCError(error, "Unable to list the nodes");
			}
		}),

	composePlacementNodes: protectedProcedure
		.input(apiFindComposeScaling)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			if (!(await canReadDocker(ctx))) return [];
			const compose = await findComposeById(input.composeId);
			try {
				return await listPlacementNodes(compose);
			} catch (error) {
				throw toTRPCError(error, "Unable to list the nodes");
			}
		}),

	autoscaling: protectedProcedure
		.input(apiFindAutoscaling)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, targetId(input.target), {
				service: ["read"],
			});
			const [policy, controller] = await Promise.all([
				findAutoscalingPolicy(input.target),
				getControllerStatus(),
			]);
			return {
				settings: settingsOf(policy),
				saved: !!policy,
				lastDecision: policy?.state?.lastDecision ?? null,
				lastEvaluatedAt: policy?.lastEvaluatedAt?.toISOString() ?? null,
				lastScaledAt: policy?.lastScaledAt?.toISOString() ?? null,
				controller,
				available: !IS_CLOUD,
			};
		}),

	updateAutoscaling: protectedProcedure
		.input(apiUpdateAutoscaling)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Autoscaling is not available on Dokploy Cloud.",
				});
			}
			// Turning it on hands replica changes to the controller, which is the
			// same power as deploying.
			await checkServicePermissionAndAccess(ctx, targetId(input.target), {
				service: ["create"],
				deployment: ["create"],
			});
			if (input.settings.enabled) {
				const unsupported = await autoscalingUnsupported(input.target);
				if (unsupported) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: unsupported,
					});
				}
			}
			const saved = await saveAutoscalingPolicy({
				target: input.target,
				settings: input.settings,
				userId: ctx.user.id,
			});
			await audit(ctx, {
				action: "update",
				resourceType:
					input.target.kind === "application" ? "application" : "compose",
				resourceId: targetId(input.target),
				resourceName:
					input.target.kind === "compose"
						? input.target.serviceName
						: undefined,
				metadata: { autoscaling: input.settings },
			});
			return { autoscalingPolicyId: saved?.autoscalingPolicyId ?? null };
		}),

	composeStatus: protectedProcedure
		.input(apiFindComposeScaling)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			const compose = await findComposeById(input.composeId);
			try {
				return await getCachedComposeScalingStatus(compose);
			} catch (error) {
				throw toTRPCError(error, "Unable to read the replica status");
			}
		}),

	setComposeReplicas: protectedProcedure
		.input(apiSetComposeReplicas)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			if (
				!composeScaleLimiter.tryConsume(
					`${input.composeId}:${input.serviceName}`,
				)
			) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message:
						"Too many scaling requests for this service. Wait a minute and try again.",
				});
			}
			const compose = await findComposeById(input.composeId);
			try {
				const result = await setComposeServiceReplicas({
					compose,
					serviceName: input.serviceName,
					replicas: input.replicas,
					userId: ctx.user.id,
					acknowledgeWarnings: input.acknowledgeWarnings,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "compose",
					resourceId: compose.composeId,
					resourceName: compose.name,
					metadata: {
						service: input.serviceName,
						replicas: { from: result.from, to: result.to },
					},
				});
				return result;
			} catch (error) {
				throw toTRPCError(error, "Error scaling the service");
			}
		}),

	composeMetrics: protectedProcedure
		.input(apiFindComposeScalingMetrics)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
				monitoring: ["read"],
			});
			const compose = await findComposeById(input.composeId);
			try {
				return await getComposeServiceMetrics(compose, input.serviceName, {
					rangeMinutes: input.rangeMinutes,
				});
			} catch (error) {
				throw toTRPCError(error, "Unable to read replica metrics");
			}
		}),

	setupComposeMetricsAgent: protectedProcedure
		.input(apiFindComposeScaling)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "The metrics agent is managed by Dokploy Cloud.",
				});
			}
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
				server: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			try {
				await installTaskMetricsAgent(compose);
			} catch (error) {
				throw toTRPCError(error, "Unable to install the metrics agent");
			}
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: compose.serverId ?? undefined,
				resourceName: compose.server?.name ?? "Dokploy",
				metadata: { taskMetrics: true },
			});
			return true;
		}),

	composeCapacity: protectedProcedure
		.input(apiFindComposeCapacity)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			const compose = await findComposeById(input.composeId);
			if (compose.composeType !== "stack") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Capacity is estimated for Stack services only; Docker does not reserve resources for plain Compose containers.",
				});
			}
			let capacity: Awaited<ReturnType<typeof getStackServiceCapacity>>;
			try {
				capacity = await getStackServiceCapacity(
					compose,
					stackServiceName(compose.appName, input.serviceName),
					input.replicas,
				);
			} catch (error) {
				throw toTRPCError(error, "Unable to estimate capacity");
			}
			return (await canReadDocker(ctx))
				? { ...capacity, nodeDetails: true }
				: { ...capacity, nodes: [], nodeDetails: false };
		}),

	updateComposePlacement: protectedProcedure
		.input(apiUpdateComposePlacement)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const { composeId, serviceName, ...placement } = input;
			const compose = await findComposeById(composeId);
			try {
				const after = await updateComposeServicePlacement({
					compose,
					serviceName,
					placement,
					userId: ctx.user.id,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "compose",
					resourceId: compose.composeId,
					resourceName: compose.name,
					metadata: { service: serviceName, placement: after },
				});
				return true;
			} catch (error) {
				throw toTRPCError(error, "Error saving the placement");
			}
		}),

	composeStackCheck: protectedProcedure
		.input(apiFindComposeScaling)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			const compose = await findComposeById(input.composeId);
			const spec = await readComposeSpecForSwitch(compose);
			return {
				readable: !!spec,
				issues: spec ? checkStackCompatibility(spec) : [],
			};
		}),

	switchComposeToStack: protectedProcedure
		.input(apiSwitchComposeToStack)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
				deployment: ["create"],
			});
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Switching to Stack is not available on Dokploy Cloud.",
				});
			}
			const compose = await findComposeById(input.composeId);
			try {
				await switchComposeToStack({
					compose,
					acknowledgeWarnings: input.acknowledgeWarnings,
				});
			} catch (error) {
				throw toTRPCError(error, "Error switching to Stack");
			}
			const job: DeploymentJob = {
				composeId: compose.composeId,
				titleLog: "Switched to Stack",
				descriptionLog: "First deploy as a Swarm stack",
				type: "deploy",
				applicationType: "compose",
				server: !!compose.serverId,
				serverId: compose.serverId ?? undefined,
			};
			await myQueue.add(
				"deployments",
				{ ...job },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: compose.composeId,
				resourceName: compose.name,
				metadata: { composeType: { from: "docker-compose", to: "stack" } },
			});
			return true;
		}),

	composeEvents: protectedProcedure
		.input(apiFindComposeScalingEvents)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			return findScalingEvents(input);
		}),

	events: protectedProcedure
		.input(apiFindScalingEvents)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["read"],
			});
			return findScalingEvents(input);
		}),
});
