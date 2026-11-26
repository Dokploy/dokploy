import { db } from "@dokploy/server/db";
import {
	type AutoscalingPolicy,
	type AutoscalingSettings,
	type AutoscalingState,
	type AutoscalingTarget,
	autoscalerController,
	autoscalingPolicies,
	scalingEvents,
} from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";
import { ScaleRejectedError } from "./scale-service";

export const DEFAULT_AUTOSCALING_SETTINGS: AutoscalingSettings = {
	enabled: false,
	minReplicas: 1,
	maxReplicas: 3,
	cpuTargetPercent: 70,
	memoryTargetPercent: null,
	tolerancePercent: 10,
	evaluationIntervalSeconds: 30,
	scaleUpWindowSeconds: 60,
	scaleDownWindowSeconds: 300,
	cooldownSeconds: 60,
	maxScaleUpStep: 4,
	maxScaleDownStep: 1,
};

export const CONTROLLER_ID = "default";

/** A heartbeat older than this means no controller is running. */
export const CONTROLLER_STALE_MS = 90_000;

const targetFilter = (target: AutoscalingTarget) =>
	target.kind === "application"
		? eq(autoscalingPolicies.applicationId, target.applicationId)
		: and(
				eq(autoscalingPolicies.composeId, target.composeId),
				eq(autoscalingPolicies.serviceName, target.serviceName),
			);

const ownerOf = (target: AutoscalingTarget) =>
	target.kind === "application"
		? { applicationId: target.applicationId }
		: { composeId: target.composeId, serviceName: target.serviceName };

export const settingsOf = (
	policy: AutoscalingPolicy | null | undefined,
): AutoscalingSettings =>
	policy
		? {
				enabled: policy.enabled,
				minReplicas: policy.minReplicas,
				maxReplicas: policy.maxReplicas,
				cpuTargetPercent: policy.cpuTargetPercent,
				memoryTargetPercent: policy.memoryTargetPercent,
				tolerancePercent: policy.tolerancePercent,
				evaluationIntervalSeconds: policy.evaluationIntervalSeconds,
				scaleUpWindowSeconds: policy.scaleUpWindowSeconds,
				scaleDownWindowSeconds: policy.scaleDownWindowSeconds,
				cooldownSeconds: policy.cooldownSeconds,
				maxScaleUpStep: policy.maxScaleUpStep,
				maxScaleDownStep: policy.maxScaleDownStep,
			}
		: DEFAULT_AUTOSCALING_SETTINGS;

export const findAutoscalingPolicy = async (target: AutoscalingTarget) =>
	(await db.query.autoscalingPolicies.findFirst({
		where: targetFilter(target),
	})) ?? null;

/** Manual changes would be undone by the next evaluation, so they wait. */
export const assertManualScalingAllowed = async (target: AutoscalingTarget) => {
	const policy = await findAutoscalingPolicy(target);
	if (policy?.enabled) {
		throw new ScaleRejectedError(
			"autoscaling_enabled",
			`Autoscaling manages these replicas (${policy.minReplicas} to ${policy.maxReplicas}). Change its minimum and maximum, or turn it off to scale by hand.`,
		);
	}
};

/**
 * The autoscaler reads its policy, then waits for metrics and capacity before
 * it scales. Run inside the scale lock right before applying: a policy that was
 * turned off or edited in that time must not be acted on.
 */
export const assertPolicyUnchanged = async (policy: AutoscalingPolicy) => {
	const current = await db.query.autoscalingPolicies.findFirst({
		where: eq(
			autoscalingPolicies.autoscalingPolicyId,
			policy.autoscalingPolicyId,
		),
	});
	if (
		!current?.enabled ||
		current.updatedAt.getTime() !== policy.updatedAt.getTime()
	) {
		throw new ScaleRejectedError(
			"autoscaling_changed",
			"The autoscaling settings changed while this was being evaluated.",
		);
	}
};

export const saveAutoscalingPolicy = async ({
	target,
	settings,
	userId,
}: {
	target: AutoscalingTarget;
	settings: AutoscalingSettings;
	userId: string | null;
}) =>
	db.transaction(async (tx) => {
		const existing =
			(await tx.query.autoscalingPolicies.findFirst({
				where: targetFilter(target),
			})) ?? null;
		const before = existing ? settingsOf(existing) : null;
		const now = new Date();
		const [saved] = existing
			? await tx
					.update(autoscalingPolicies)
					.set({
						...settings,
						updatedAt: now,
						// A policy that was off starts from fresh readings.
						...(!existing.enabled && settings.enabled && { state: null }),
					})
					.where(
						eq(
							autoscalingPolicies.autoscalingPolicyId,
							existing.autoscalingPolicyId,
						),
					)
					.returning()
			: await tx
					.insert(autoscalingPolicies)
					.values({ ...ownerOf(target), ...settings })
					.returning();

		await tx.insert(scalingEvents).values({
			...ownerOf(target),
			source: "manual",
			action: "policy_change",
			reason:
				before?.enabled === settings.enabled
					? "Autoscaling settings changed"
					: settings.enabled
						? `Autoscaling turned on (${settings.minReplicas} to ${settings.maxReplicas} replicas)`
						: "Autoscaling turned off",
			userId,
			details: { autoscaling: { before, after: settings } },
		});
		return saved;
	});

export const listEnabledPolicies = () =>
	db.query.autoscalingPolicies.findMany({
		where: eq(autoscalingPolicies.enabled, true),
	});

export const isPolicyDue = (policy: AutoscalingPolicy, now: number) =>
	!policy.lastEvaluatedAt ||
	now - policy.lastEvaluatedAt.getTime() >=
		policy.evaluationIntervalSeconds * 1000;

/** Writes only the controller's own columns, never the user's settings. */
export const saveEvaluation = async (
	policyId: string,
	{
		state,
		evaluatedAt,
		scaledAt,
	}: { state: AutoscalingState; evaluatedAt: Date; scaledAt: Date | null },
) => {
	await db
		.update(autoscalingPolicies)
		.set({
			state,
			lastEvaluatedAt: evaluatedAt,
			...(scaledAt && { lastScaledAt: scaledAt }),
		})
		.where(eq(autoscalingPolicies.autoscalingPolicyId, policyId));
};

export const recordControllerHeartbeat = async ({
	instance,
	version,
	startedAt,
}: {
	instance: string;
	version: string | null;
	startedAt: Date;
}) => {
	const now = new Date();
	await db
		.insert(autoscalerController)
		.values({
			controllerId: CONTROLLER_ID,
			instance,
			version,
			startedAt,
			heartbeatAt: now,
		})
		.onConflictDoUpdate({
			target: autoscalerController.controllerId,
			set: { instance, version, startedAt, heartbeatAt: now },
		});
};

export const getControllerStatus = async (now = Date.now()) => {
	const row = await db.query.autoscalerController.findFirst({
		where: eq(autoscalerController.controllerId, CONTROLLER_ID),
	});
	if (!row) return { running: false, heartbeatAt: null, version: null };
	return {
		running: now - row.heartbeatAt.getTime() < CONTROLLER_STALE_MS,
		heartbeatAt: row.heartbeatAt.toISOString(),
		version: row.version,
	};
};
