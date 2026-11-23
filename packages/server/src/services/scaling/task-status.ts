export interface SwarmTask {
	ID?: string;
	ServiceID?: string;
	Slot?: number;
	NodeID?: string;
	DesiredState?: string;
	UpdatedAt?: string;
	Status?: {
		Timestamp?: string;
		State?: string;
		Message?: string;
		Err?: string;
		ContainerStatus?: { ContainerID?: string; ExitCode?: number };
	};
}

export interface SwarmNode {
	ID?: string;
	Description?: { Hostname?: string };
	Spec?: { Role?: string; Availability?: string };
	Status?: { State?: string };
}

export type ReplicaPhase =
	| "ready"
	| "starting"
	| "pending"
	| "stopping"
	| "failed"
	| "completed"
	| "stopped";

export const ROLLOUT_IN_PROGRESS_STATES = new Set([
	"updating",
	"paused",
	"rollback_started",
	"rollback_paused",
]);

const PENDING_STATES = new Set(["new", "allocated", "pending"]);
const STARTING_STATES = new Set([
	"assigned",
	"accepted",
	"preparing",
	"ready",
	"starting",
]);
const FAILED_STATES = new Set(["failed", "rejected", "orphaned"]);
const CURRENT_PHASES = new Set<ReplicaPhase>([
	"ready",
	"starting",
	"pending",
	"stopping",
]);

// Swarm puts a task in the service VIP only once it is running, and a task
// with a HEALTHCHECK stays in "starting" until the check first passes.
export const classifyTask = (task: SwarmTask): ReplicaPhase => {
	const state = task.Status?.State ?? "";
	if (FAILED_STATES.has(state)) return "failed";
	if (task.DesiredState === "running") {
		if (state === "running") return "ready";
		if (PENDING_STATES.has(state)) return "pending";
		if (STARTING_STATES.has(state)) return "starting";
	}
	if (state === "running") return "stopping";
	if (state === "complete") return "completed";
	return "stopped";
};

export interface ReplicaInfo {
	taskId: string;
	slot: number | null;
	phase: ReplicaPhase;
	state: string;
	desiredState: string;
	message: string | null;
	error: string | null;
	/** Why a failed replica failed, in words; see `explainFailure`. */
	cause: string | null;
	exitCode: number | null;
	containerId: string | null;
	since: string | null;
	receivesTraffic: boolean;
	node: {
		id: string;
		hostname: string | null;
		state: string | null;
		availability: string | null;
	} | null;
}

export interface ReplicaSummary {
	replicas: ReplicaInfo[];
	recentFailures: ReplicaInfo[];
	counts: {
		ready: number;
		starting: number;
		pending: number;
		stopping: number;
		failedRecent: number;
	};
	pendingReasons: string[];
	distribution: { nodeId: string; hostname: string | null; count: number }[];
}

/** What the exited container of a failed replica tells beyond the task. */
export interface ContainerDiagnosis {
	oomKilled: boolean;
	/** Outputs of the failed health checks Docker kept, oldest first. */
	failedChecks: string[];
}

const describeChecks = (outputs: string[]) => {
	const runs: { output: string; count: number }[] = [];
	for (const output of outputs) {
		const last = runs.at(-1);
		if (last?.output === output) last.count += 1;
		else runs.push({ output, count: 1 });
	}
	return runs
		.map(({ output, count }) => `"${output}"${count > 1 ? ` ×${count}` : ""}`)
		.join(", then ");
};

/**
 * Puts a failure in words. Swarm's own message for a failed health check,
 * "task: non-zero exit (137): dockerexec: unhealthy container", reads like a
 * crash or an out-of-memory kill, when 137 only means the replica was still
 * running when the stop that followed ran out of grace period.
 */
export const explainFailure = ({
	error,
	exitCode,
	container,
}: {
	error: string | null;
	exitCode: number | null;
	container: ContainerDiagnosis | null;
}): string | null => {
	if (container?.oomKilled) {
		return "It ran out of memory: the kernel killed it at its memory limit.";
	}
	if (error?.includes("unhealthy container")) {
		const checks = container?.failedChecks.length
			? ` Failed checks: ${describeChecks(container.failedChecks)}.`
			: "";
		const killed =
			exitCode === 137
				? " Exit code 137 means it had not stopped by the end of its stop grace period, so Docker killed it."
				: "";
		return `Its health check failed, so Swarm replaced it.${checks}${killed} It did not run out of memory.`;
	}
	if (exitCode === 137) {
		return container
			? "It was killed (signal 9), not for memory: it outlasted a stop's grace period, or something outside Docker killed it."
			: "It was killed (signal 9): it ran out of memory, or outlasted a stop's grace period.";
	}
	if (exitCode !== null && exitCode !== 0) {
		return `Its process exited with code ${exitCode}. Its logs show why.`;
	}
	return null;
};

const toReplicaInfo = (
	task: SwarmTask,
	nodes: Map<string, SwarmNode>,
): ReplicaInfo => {
	const phase = classifyTask(task);
	const node = task.NodeID ? nodes.get(task.NodeID) : undefined;
	const error = task.Status?.Err || null;
	const exitCode = task.Status?.ContainerStatus?.ExitCode ?? null;
	return {
		taskId: task.ID ?? "",
		slot: task.Slot ?? null,
		phase,
		state: task.Status?.State ?? "unknown",
		desiredState: task.DesiredState ?? "unknown",
		message: task.Status?.Message || null,
		error,
		cause:
			phase === "failed"
				? explainFailure({ error, exitCode, container: null })
				: null,
		exitCode,
		containerId: task.Status?.ContainerStatus?.ContainerID || null,
		since: task.Status?.Timestamp ?? task.UpdatedAt ?? null,
		receivesTraffic: phase === "ready",
		node: task.NodeID
			? {
					id: task.NodeID,
					hostname: node?.Description?.Hostname ?? null,
					state: node?.Status?.State ?? null,
					availability: node?.Spec?.Availability ?? null,
				}
			: null,
	};
};

const timeOf = (replica: ReplicaInfo) =>
	replica.since ? Date.parse(replica.since) : Number.NaN;

export const summarizeReplicas = ({
	tasks,
	nodes,
	now = Date.now(),
	failureWindowMs = 15 * 60_000,
	failureLimit = 10,
}: {
	tasks: SwarmTask[];
	nodes: SwarmNode[];
	now?: number;
	failureWindowMs?: number;
	failureLimit?: number;
}): ReplicaSummary => {
	const nodesById = new Map(
		nodes.filter((node) => node.ID).map((node) => [node.ID as string, node]),
	);
	const all = tasks.map((task) => toReplicaInfo(task, nodesById));

	const replicas = all
		.filter((replica) => CURRENT_PHASES.has(replica.phase))
		.sort(
			(a, b) =>
				(a.slot ?? Number.MAX_SAFE_INTEGER) -
				(b.slot ?? Number.MAX_SAFE_INTEGER),
		);

	const recentFailures = all
		.filter(
			(replica) =>
				replica.phase === "failed" && now - timeOf(replica) <= failureWindowMs,
		)
		.sort((a, b) => timeOf(b) - timeOf(a))
		.slice(0, failureLimit);

	const count = (phase: ReplicaPhase) =>
		replicas.filter((replica) => replica.phase === phase).length;

	const pendingReasons = [
		...new Set(
			replicas
				.filter((replica) => replica.phase === "pending")
				.map((replica) => replica.error ?? replica.message)
				.filter((reason): reason is string => !!reason),
		),
	];

	const distribution = new Map<
		string,
		{ nodeId: string; hostname: string | null; count: number }
	>();
	for (const replica of replicas) {
		if (!replica.node || replica.phase === "stopping") continue;
		const entry = distribution.get(replica.node.id) ?? {
			nodeId: replica.node.id,
			hostname: replica.node.hostname,
			count: 0,
		};
		entry.count += 1;
		distribution.set(replica.node.id, entry);
	}

	return {
		replicas,
		recentFailures,
		counts: {
			ready: count("ready"),
			starting: count("starting"),
			pending: count("pending"),
			stopping: count("stopping"),
			failedRecent: recentFailures.length,
		},
		pendingReasons,
		distribution: [...distribution.values()].sort((a, b) => b.count - a.count),
	};
};
