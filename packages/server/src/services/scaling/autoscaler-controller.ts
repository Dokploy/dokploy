import { hostname } from "node:os";
import type {
	AutoscalingDecision,
	AutoscalingPolicy,
	AutoscalingState,
	AutoscalingTarget,
} from "@dokploy/server/db/schema";
import { findApplicationById } from "../application";
import { findComposeById } from "../compose";
import { acquireAdvisoryLock } from "./advisory-lock";
import {
	type DecisionInput,
	type DecisionOutput,
	decideReplicas,
} from "./autoscaler-decision";
import {
	isPolicyDue,
	listEnabledPolicies,
	recordControllerHeartbeat,
	saveEvaluation,
} from "./autoscaling-policy";
import {
	getApplicationCapacity,
	getStackServiceCapacity,
} from "./capacity-service";
import { setComposeServiceReplicas } from "./compose-scale";
import { getComposeScalingStatus, stackServiceName } from "./compose-status";
import { recordScalingEvent } from "./events";
import { setApplicationReplicas } from "./manual-scale";
import {
	getApplicationMetrics,
	getComposeServiceMetrics,
	type ReplicaMetricsResult,
} from "./metrics-client";
import { composeScaleLockKey, isDeploying } from "./scale-lock";
import { getApplicationScalingStatus } from "./status";
import type { ReplicaSummary } from "./task-status";

const LEADER_LOCK = "dokploy:autoscaler";
/** Metrics are read over this window; only the latest readings count. */
const METRICS_RANGE_MINUTES = 5;

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

export const targetOf = (policy: AutoscalingPolicy): AutoscalingTarget =>
	policy.applicationId
		? { kind: "application", applicationId: policy.applicationId }
		: {
				kind: "compose",
				composeId: policy.composeId as string,
				serviceName: policy.serviceName as string,
			};

const metricsInput = (
	result: ReplicaMetricsResult,
): Pick<DecisionInput, "metrics" | "metricsUnavailable"> => {
	if (result.agent.status === "ok" && result.data) {
		return {
			metrics: {
				cpuPercent: result.data.summary.averages.cpuPercent,
				memoryPercent: result.data.summary.averages.memoryPercent,
				coverage: result.data.summary.coverage,
			},
			metricsUnavailable: null,
		};
	}
	const reasons: Record<string, string> = {
		not_configured:
			"The metrics agent is not set up on this server. Enable replica metrics on the Scaling tab.",
		collection_disabled:
			"Per-replica collection is turned off on this server's metrics agent. Enable replica metrics on the Scaling tab.",
		outdated:
			"The metrics agent on this server does not read Docker Compose containers. Update it from the Scaling tab.",
	};
	return {
		metrics: null,
		metricsUnavailable:
			result.agent.message ??
			reasons[result.agent.status] ??
			"Metrics are unavailable",
	};
};

const replicaState = (
	summary: ReplicaSummary,
	current: number,
): Pick<DecisionInput, "settling" | "pending"> => ({
	settling:
		summary.counts.starting > 0 || summary.counts.stopping > 0
			? `${summary.counts.ready} of ${current} replicas are ready; waiting for the rest to start or stop`
			: null,
	pending:
		summary.counts.pending > 0
			? {
					count: summary.counts.pending,
					reason: summary.pendingReasons[0] ?? null,
				}
			: null,
});

interface Evaluation {
	/** How the target is named in the logs: its Swarm service, if it has one. */
	label: string;
	input: Omit<DecisionInput, "policy" | "state" | "now">;
	/** Applies a count, recording the decision as the reason. */
	apply: (replicas: number, output: DecisionOutput) => Promise<void>;
	/** How many replicas fit, or null when there is no limit to know of. */
	placeable: (replicas: number) => Promise<number | null>;
}

const autoscalerTrigger = (output: DecisionOutput) => ({
	source: "autoscaler" as const,
	reason: output.decision.reason,
	details: { autoscaler: output.decision },
});

const evaluateApplication = async (
	applicationId: string,
): Promise<Evaluation> => {
	const application = await findApplicationById(applicationId);
	const status = await getApplicationScalingStatus(application);
	const current = status.desired ?? status.configured;
	const blocked =
		status.mode !== "replicated"
			? `Autoscaling needs a replicated service; this one runs in ${status.mode} mode`
			: !status.deployed
				? "Not deployed yet"
				: status.stopped
					? "Stopped. Autoscaling resumes when it is started."
					: status.rolloutInProgress
						? "A rollout is in progress"
						: application.applicationStatus === "running"
							? "A deployment is in progress"
							: null;
	return {
		label: application.appName,
		input: {
			current,
			blocked,
			...replicaState(status, current),
			...(blocked
				? { metrics: null, metricsUnavailable: null }
				: metricsInput(
						await getApplicationMetrics(application, {
							rangeMinutes: METRICS_RANGE_MINUTES,
						}),
					)),
		},
		placeable: async (replicas) =>
			(await getApplicationCapacity(application, replicas, { fresh: true }))
				.placeable,
		apply: async (replicas, output) => {
			await setApplicationReplicas({
				application,
				replicas,
				userId: null,
				trigger: autoscalerTrigger(output),
			});
		},
	};
};

const evaluateComposeService = async (
	composeId: string,
	serviceName: string,
): Promise<Evaluation> => {
	const compose = await findComposeById(composeId);
	const status = await getComposeScalingStatus(compose);
	const service = status.services.find(
		(candidate) => candidate.serviceName === serviceName,
	);
	const current = service ? (service.desired ?? service.configured) : 0;
	const deploying =
		compose.composeStatus === "running" ||
		(await isDeploying(composeScaleLockKey(composeId)));
	const blocked = !service
		? `The compose has no service named ${serviceName}`
		: compose.command
			? "The compose deploys with a custom command, so Dokploy cannot scale it"
			: deploying
				? "A deployment is in progress"
				: service.mode !== "replicated"
					? `Autoscaling needs a replicated service; this one runs in ${service.mode} mode`
					: !service.deployed
						? "Not deployed yet"
						: service.stopped
							? "Stopped. Autoscaling resumes when it is started."
							: service.rolloutInProgress
								? "A rollout is in progress"
								: service.singleInstanceReasons.length > 0
									? `It can run only one container: ${service.singleInstanceReasons.join(", ")}`
									: null;
	const stack = compose.composeType === "stack";
	return {
		label: stack
			? stackServiceName(compose.appName, serviceName)
			: `${compose.appName}/${serviceName}`,
		input: {
			current,
			blocked,
			...(service
				? replicaState(service, current)
				: { settling: null, pending: null }),
			...(blocked
				? { metrics: null, metricsUnavailable: null }
				: metricsInput(
						await getComposeServiceMetrics(compose, serviceName, {
							rangeMinutes: METRICS_RANGE_MINUTES,
						}),
					)),
		},
		// Docker reserves nothing for plain Compose containers, so there is no
		// limit to estimate.
		placeable: async (replicas) =>
			stack
				? (
						await getStackServiceCapacity(
							compose,
							stackServiceName(compose.appName, serviceName),
							replicas,
							{ fresh: true },
						)
					).placeable
				: null,
		apply: async (replicas, output) => {
			await setComposeServiceReplicas({
				compose,
				serviceName,
				replicas,
				userId: null,
				trigger: autoscalerTrigger(output),
			});
		},
	};
};

const ownerOf = (target: AutoscalingTarget) =>
	target.kind === "application"
		? { applicationId: target.applicationId }
		: { composeId: target.composeId, serviceName: target.serviceName };

const fallbackLabel = (target: AutoscalingTarget) =>
	target.kind === "application"
		? `application ${target.applicationId}`
		: `compose ${target.composeId}/${target.serviceName}`;

/**
 * Changes and new problems always reach the logs; with
 * DOKPLOY_AUTOSCALER_LOG=debug, every evaluation does.
 */
const logDecision = (
	label: string,
	{ decision }: DecisionOutput,
	{ applied, recorded }: { applied: boolean; recorded: boolean },
) => {
	const prefix = `Autoscaler: ${label}:`;
	if (applied) {
		console.log(
			`${prefix} ${decision.action} ${decision.current} -> ${decision.target}: ${decision.reason}`,
		);
	} else if (recorded) {
		console.warn(`${prefix} ${decision.action}: ${decision.reason}`);
	} else if (process.env.DOKPLOY_AUTOSCALER_LOG === "debug") {
		console.log(
			`${prefix} ${decision.action} at ${decision.current ?? "?"}: ${decision.reason}`,
		);
	}
};

/**
 * Evaluates one policy and applies its decision. Everything it needs is read
 * again each time, so a restart or a second controller cannot act on stale
 * state; the replica change itself goes through the same locked paths as a
 * manual change.
 */
export const evaluatePolicy = async (
	policy: AutoscalingPolicy,
	now = Date.now(),
): Promise<DecisionOutput & { state: AutoscalingState }> => {
	const target = targetOf(policy);
	let label = fallbackLabel(target);
	let output: DecisionOutput;
	let scaledAt: Date | null = null;
	try {
		const evaluation =
			target.kind === "application"
				? await evaluateApplication(target.applicationId)
				: await evaluateComposeService(target.composeId, target.serviceName);
		label = evaluation.label;
		output = decideReplicas({
			...evaluation.input,
			policy,
			state: policy.state,
			now,
		});

		if (output.apply !== null && output.apply > evaluation.input.current) {
			const placeable = await evaluation.placeable(output.apply);
			if (placeable !== null && placeable < output.apply) {
				const capped = Math.max(evaluation.input.current, placeable);
				const note = `only ${placeable} replicas fit on the eligible nodes`;
				output =
					capped > evaluation.input.current
						? {
								...output,
								apply: capped,
								decision: {
									...output.decision,
									target: capped,
									reason: `${output.decision.reason}; ${note}, so scaling to ${capped}`,
								},
							}
						: {
								...output,
								apply: null,
								decision: {
									...output.decision,
									action: "hold",
									reason: `${output.decision.reason}, but ${note}`,
								},
								eventKey: `capacity:${placeable}`,
								state: { ...output.state, recommendations: [] },
							};
			}
		}

		if (output.apply !== null) {
			try {
				await evaluation.apply(output.apply, output);
				scaledAt = new Date(now);
			} catch (error) {
				output = {
					...output,
					apply: null,
					eventKey: `scale-failed:${errorMessage(error)}`,
					decision: {
						...output.decision,
						action: "hold",
						reason: `Could not scale to ${output.apply}: ${errorMessage(error)}`,
					},
					state: { ...output.state, recommendations: [] },
				};
			}
		}
	} catch (error) {
		const reason = `Evaluation failed: ${errorMessage(error)}`;
		const decision: AutoscalingDecision = {
			at: new Date(now).toISOString(),
			action: "error",
			reason,
			current: null,
			recommended: null,
			target: null,
			cpuPercent: null,
			memoryPercent: null,
			coverage: null,
		};
		output = {
			apply: null,
			eventKey: `error:${errorMessage(error)}`,
			decision,
			state: { recommendations: [], lastDecision: decision },
		};
	}

	const previousKey = policy.state?.lastEventKey ?? null;
	const recorded = !!output.eventKey && output.eventKey !== previousKey;
	logDecision(label, output, { applied: scaledAt !== null, recorded });
	if (recorded) {
		await recordScalingEvent({
			...ownerOf(target),
			source: "autoscaler",
			action: output.decision.action === "error" ? "error" : "hold",
			fromReplicas: output.decision.current,
			toReplicas: output.decision.target,
			reason: output.decision.reason,
			userId: null,
			details: { autoscaler: output.decision },
		}).catch((error) =>
			console.error("Autoscaler: could not record an event", error),
		);
	}

	const state: AutoscalingState = {
		...output.state,
		lastEventKey: output.eventKey,
	};
	await saveEvaluation(policy.autoscalingPolicyId, {
		state,
		evaluatedAt: new Date(now),
		scaledAt,
	});
	return { ...output, state };
};

const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal?.aborted) return resolve();
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});

const runAll = async <T>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<unknown>,
) => {
	const queue = [...items];
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
			for (let item = queue.shift(); item; item = queue.shift()) {
				await fn(item);
			}
		}),
	);
};

/** Evaluates every enabled policy whose interval has passed. */
export const runControllerTick = async ({
	concurrency = 4,
	now = Date.now,
}: {
	concurrency?: number;
	now?: () => number;
} = {}) => {
	const due = (await listEnabledPolicies()).filter((policy) =>
		isPolicyDue(policy, now()),
	);
	await runAll(due, concurrency, (policy) =>
		evaluatePolicy(policy, now()).catch((error) =>
			console.error(
				`Autoscaler: evaluating ${policy.autoscalingPolicyId} failed`,
				error,
			),
		),
	);
	return due.length;
};

export interface AutoscalerOptions {
	version: string | null;
	signal?: AbortSignal;
	tickMs?: number;
	standbyMs?: number;
	/** Called on every loop, active or standing by, for the health check. */
	onAlive?: () => void;
}

/**
 * Runs the controller until `signal` aborts. Only the process holding the
 * leader lock evaluates policies; any other one stands by and takes over if
 * the leader's database session ends.
 */
export const runAutoscaler = async ({
	version,
	signal,
	tickMs = 5_000,
	standbyMs = 15_000,
	onAlive,
}: AutoscalerOptions) => {
	const instance = `${hostname()}:${process.pid}`;
	while (!signal?.aborted) {
		onAlive?.();
		const lease = await acquireAdvisoryLock(LEADER_LOCK, { wait: false }).catch(
			(error) => {
				console.error("Autoscaler: cannot reach the database", error);
				return null;
			},
		);
		if (!lease) {
			await sleep(standbyMs, signal);
			continue;
		}
		const startedAt = new Date();
		console.log(`Autoscaler ${instance} is active`);
		try {
			while (!signal?.aborted && (await lease.isHeld())) {
				onAlive?.();
				await recordControllerHeartbeat({ instance, version, startedAt });
				await runControllerTick();
				await sleep(tickMs, signal);
			}
		} catch (error) {
			console.error("Autoscaler: controller loop failed", error);
			await sleep(tickMs, signal);
		} finally {
			await lease.release();
		}
	}
};
