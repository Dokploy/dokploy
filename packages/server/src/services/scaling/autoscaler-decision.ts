import type {
	AutoscalingDecision,
	AutoscalingPolicy,
	AutoscalingRecommendation,
	AutoscalingState,
} from "@dokploy/server/db/schema";

export type DecisionPolicy = Pick<
	AutoscalingPolicy,
	| "minReplicas"
	| "maxReplicas"
	| "cpuTargetPercent"
	| "memoryTargetPercent"
	| "tolerancePercent"
	| "scaleUpWindowSeconds"
	| "scaleDownWindowSeconds"
	| "cooldownSeconds"
	| "maxScaleUpStep"
	| "maxScaleDownStep"
	| "lastScaledAt"
>;

export interface DecisionMetrics {
	/** Average over replicas with a fresh reading, against reservation or limit. */
	cpuPercent: number | null;
	memoryPercent: number | null;
	coverage: { ready: number; fresh: number };
}

export interface DecisionInput {
	policy: DecisionPolicy;
	state: AutoscalingState | null;
	now: number;
	/** Replicas the service is asked to run. */
	current: number;
	/** Set when scaling is unsafe right now: a deploy, a rollout, a stop. */
	blocked: string | null;
	/** Set while replicas start or stop, so their readings are not steady. */
	settling: string | null;
	/** Replicas Swarm cannot place; more of them would wait just the same. */
	pending: { count: number; reason: string | null } | null;
	metrics: DecisionMetrics | null;
	/** Why there are no metrics, when `metrics` is null. */
	metricsUnavailable: string | null;
}

export interface DecisionOutput {
	decision: AutoscalingDecision;
	/** Leaves `lastEventKey` to the caller, which records the events. */
	state: Omit<AutoscalingState, "lastEventKey">;
	/** The replica count to apply now, if any. */
	apply: number | null;
	/**
	 * Set for a hold worth a history entry, something the user may need to
	 * fix. Stable while the problem lasts, unlike the reason, which carries
	 * the current readings.
	 */
	eventKey: string | null;
}

const HISTORY_LIMIT = 1000;

const percent = (value: number) => `${Math.round(value)}%`;

const duration = (value: number) =>
	value >= 120 && value % 60 === 0
		? `${value / 60} min`
		: `${Math.round(value)}s`;

const replicas = (count: number) => `${count} replica${count === 1 ? "" : "s"}`;

/**
 * Picks the replica count for one evaluation, the way Kubernetes' HPA does:
 * each metric asks for ceil(current × usage ÷ target), the highest ask wins,
 * and an ask within the tolerance counts as "no change". One departure: with
 * CPU also read, memory below its target has no say in removals. A change is
 * applied only once the recommendations over its whole window agree
 * (scale-up takes the lowest of them, scale-down the highest), outside the
 * cooldown after the last change, and by at most one step.
 *
 * Any hold clears the recorded recommendations, so a window only ever covers
 * uninterrupted, steady readings. Scale-down never happens on partial data.
 */
export const decideReplicas = (input: DecisionInput): DecisionOutput => {
	const { policy, now, current } = input;
	const at = new Date(now).toISOString();

	const finish = (
		decision: Omit<
			AutoscalingDecision,
			"at" | "current" | "cpuPercent" | "memoryPercent" | "coverage"
		>,
		{
			recommendations = [],
			apply = null,
			eventKey = null,
		}: {
			recommendations?: AutoscalingRecommendation[];
			apply?: number | null;
			eventKey?: string | null;
		} = {},
	): DecisionOutput => {
		const full: AutoscalingDecision = {
			at,
			current,
			cpuPercent: input.metrics?.cpuPercent ?? null,
			memoryPercent: input.metrics?.memoryPercent ?? null,
			coverage: input.metrics?.coverage ?? null,
			...decision,
		};
		return {
			decision: full,
			state: { recommendations, lastDecision: full },
			apply,
			eventKey,
		};
	};
	const hold = (reason: string, eventKey: string | null = null) =>
		finish(
			{ action: "hold", reason, recommended: null, target: null },
			{ eventKey },
		);
	const scaleTo = (
		target: number,
		reason: string,
		recommended: number | null,
	) =>
		finish(
			{
				action: target > current ? "scale_up" : "scale_down",
				reason,
				recommended,
				target,
			},
			{ apply: target },
		);

	if (input.blocked) return hold(input.blocked);

	// The bounds are the user's own settings, so they apply without waiting
	// for metrics or windows.
	if (current < policy.minReplicas) {
		return scaleTo(
			policy.minReplicas,
			`Below the minimum of ${replicas(policy.minReplicas)}`,
			null,
		);
	}
	if (current > policy.maxReplicas) {
		return scaleTo(
			policy.maxReplicas,
			`Above the maximum of ${replicas(policy.maxReplicas)}`,
			null,
		);
	}

	if (input.settling) return hold(input.settling);
	if (!input.metrics) {
		const reason = input.metricsUnavailable ?? "No metrics available";
		return hold(reason, `metrics:${reason}`);
	}

	const { coverage } = input.metrics;
	if (coverage.fresh === 0) {
		return hold(
			"No replica has a recent reading from the metrics agent",
			"no-readings",
		);
	}
	const partial = coverage.fresh < coverage.ready;
	const tolerance = policy.tolerancePercent / 100;
	const clamp = (count: number) =>
		Math.min(policy.maxReplicas, Math.max(policy.minReplicas, count));
	const asks: {
		name: string;
		noun: string;
		usage: number;
		target: number;
		ratio: number;
		ask: number;
	}[] = [];
	for (const [name, noun, usage, target] of [
		["CPU", "CPU", input.metrics.cpuPercent, policy.cpuTargetPercent],
		[
			"Memory",
			"memory",
			input.metrics.memoryPercent,
			policy.memoryTargetPercent,
		],
	] as const) {
		if (usage === null || target === null) continue;
		// Replicas without a reading count as idle: when adding replicas that
		// can only ask for fewer.
		const effective = partial
			? (usage * coverage.fresh) / coverage.ready
			: usage;
		const ratio = effective / target;
		asks.push({
			name,
			noun,
			usage,
			target,
			ratio,
			ask: clamp(
				Math.abs(ratio - 1) <= tolerance ? current : Math.ceil(current * ratio),
			),
		});
	}
	if (asks.length === 0) {
		return hold(
			"No CPU or memory reading can be compared with a target. Set a reservation or a limit for each metric you target.",
			"no-basis",
		);
	}

	// Most of the memory a replica holds when idle is its own baseline, which
	// removing other replicas does not shift onto it. The HPA rule reads it
	// as load all the same, so idle replicas would never go. When CPU, which
	// does follow load, has a reading too, memory below its target leaves
	// removals to CPU; it still adds replicas, and holds them at its target.
	const cpuVotes = asks.some((ask) => ask.name === "CPU");
	const voters = asks.filter(
		(ask) => !(ask.name === "Memory" && cpuVotes && ask.ratio < 1 - tolerance),
	);

	let recommended = Math.max(...voters.map((ask) => ask.ask));
	if (partial && recommended < current) recommended = current;
	const readings = asks
		.map(
			(ask) =>
				`${ask.name} ${percent(ask.usage)} (target ${percent(ask.target)})`,
		)
		.join(", ");

	const longestWindow = Math.max(
		policy.scaleUpWindowSeconds,
		policy.scaleDownWindowSeconds,
	);
	const previous = input.state?.recommendations ?? [];
	const isRecent = (entry: AutoscalingRecommendation) =>
		now - Date.parse(entry.at) <= longestWindow * 1000;
	// The last entry from before the window shows the readings were steady
	// for all of it; without it, evaluations a few seconds apart would always
	// leave the oldest kept entry just short of the window.
	const boundary = previous.filter((entry) => !isRecent(entry)).at(-1);
	const recommendations = [
		...(boundary ? [boundary] : []),
		...previous.filter(isRecent),
		{ at, replicas: recommended },
	].slice(-HISTORY_LIMIT);
	const wait = (reason: string) =>
		finish(
			{
				action: "hold",
				reason,
				recommended,
				target: recommended === current ? null : recommended,
			},
			{ recommendations },
		);

	if (recommended === current) {
		const holding = voters.find((ask) => ask.ask >= current);
		const fewer = voters.find((ask) => ask.ask < current);
		return wait(
			`${readings}: ${
				holding && fewer
					? `${holding.noun} keeps ${replicas(current)}; ${fewer.noun} alone would run ${replicas(fewer.ask)}`
					: `${replicas(current)} is right`
			}${
				partial
					? `. ${coverage.ready - coverage.fresh} replica(s) have no recent reading, so it will not scale down`
					: ""
			}`,
		);
	}

	const up = recommended > current;
	if (up && input.pending && input.pending.count > 0) {
		return hold(
			`${readings}: wants ${replicas(recommended)}, but ${replicas(input.pending.count)} already wait for a node${input.pending.reason ? ` (${input.pending.reason})` : ""}`,
			`pending:${input.pending.reason ?? ""}`,
		);
	}
	const windowSeconds = up
		? policy.scaleUpWindowSeconds
		: policy.scaleDownWindowSeconds;
	const steadyFor = (now - Date.parse(recommendations[0]?.at ?? at)) / 1000;
	// The change comes once the last recommendation against it leaves the
	// window, so the countdown runs from that one, not from the oldest kept.
	const against = recommendations
		.filter((entry) =>
			up ? entry.replicas <= current : entry.replicas >= current,
		)
		.at(-1);
	const wantedFor = against ? (now - Date.parse(against.at)) / 1000 : steadyFor;
	const waiting = () =>
		wait(
			`${readings}: wants ${replicas(recommended)} for ${duration(wantedFor)} of the ${duration(windowSeconds)} ${up ? "scale-up" : "scale-down"} window`,
		);
	if (steadyFor < windowSeconds) return waiting();
	const inWindow = recommendations
		.filter((entry) => now - Date.parse(entry.at) <= windowSeconds * 1000)
		.map((entry) => entry.replicas);
	const stabilized = up ? Math.min(...inWindow) : Math.max(...inWindow);
	if (up ? stabilized <= current : stabilized >= current) return waiting();

	const lastScaledAt = policy.lastScaledAt?.getTime() ?? null;
	if (
		lastScaledAt !== null &&
		now - lastScaledAt < policy.cooldownSeconds * 1000
	) {
		return wait(
			`${readings}: cooling down for ${duration(policy.cooldownSeconds - (now - lastScaledAt) / 1000)} after the last change`,
		);
	}

	const step = up ? policy.maxScaleUpStep : policy.maxScaleDownStep;
	const target = up
		? Math.min(stabilized, current + step)
		: Math.max(stabilized, current - step);
	const change = Math.abs(target - current);
	return scaleTo(
		target,
		`${readings} over ${duration(windowSeconds)}: ${up ? "adding" : "removing"} ${replicas(change)}${target !== stabilized ? ` (at most ${step} per step)` : ""}`,
		recommended,
	);
};
