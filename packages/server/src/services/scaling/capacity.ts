export interface CapacityNode {
	ID?: string;
	Description?: {
		Hostname?: string;
		Platform?: { Architecture?: string; OS?: string };
		Resources?: { NanoCPUs?: number; MemoryBytes?: number };
		Engine?: { Labels?: Record<string, string> };
	};
	Spec?: {
		Role?: string;
		Availability?: string;
		Labels?: Record<string, string>;
	};
	Status?: { State?: string };
}

export interface CapacityTask {
	ServiceID?: string;
	NodeID?: string;
	DesiredState?: string;
	Status?: { State?: string };
	Spec?: {
		Resources?: { Reservations?: { NanoCPUs?: number; MemoryBytes?: number } };
	};
}

export interface PlacementRequirements {
	cpuReservation: number;
	memoryReservation: number;
	cpuLimit: number;
	memoryLimit: number;
	constraints: string[];
	maxReplicasPerNode: number | null;
	hostPorts: number[];
}

export interface ParsedConstraint {
	key: string;
	operator: "==" | "!=";
	value: string;
}

export type Eligibility = "eligible" | "ineligible" | "unknown";

export interface NodeCapacity {
	id: string;
	hostname: string | null;
	role: string | null;
	state: string | null;
	availability: string | null;
	eligibility: Eligibility;
	reason: string | null;
	cpu: { total: number; reservedByOthers: number; available: number };
	memory: { total: number; reservedByOthers: number; available: number };
	appReplicas: number;
	slots: number | null;
}

export interface CapacityReport {
	requirements: PlacementRequirements;
	nodes: NodeCapacity[];
	eligibleNodes: number;
	unknownNodes: number;
	/** NanoCPUs of the eligible nodes together, before anything runs on them. */
	eligibleCpu: number;
	placeable: number | null;
}

const CONSTRAINT_PATTERN = /^\s*([\w.-]+)\s*(==|!=)\s*(.*?)\s*$/;

export const parseConstraint = (
	expression: string,
): ParsedConstraint | null => {
	const match = CONSTRAINT_PATTERN.exec(expression);
	if (!match?.[1] || !match[2] || match[3] === undefined) return null;
	return {
		key: match[1],
		operator: match[2] as "==" | "!=",
		value: match[3],
	};
};

const NODE_LABEL_PREFIX = "node.labels.";
const ENGINE_LABEL_PREFIX = "engine.labels.";

// swarmkit matches attribute names and label prefixes case-insensitively,
// but the label name itself is case-sensitive.
const labelName = (key: string, prefix: string) =>
	key.length > prefix.length &&
	key.slice(0, prefix.length).toLowerCase() === prefix
		? key.slice(prefix.length)
		: null;

// Mirrors the attributes swarmkit understands; a missing label reads as "".
const nodeAttribute = (node: CapacityNode, key: string): string | undefined => {
	switch (key.toLowerCase()) {
		case "node.id":
			return node.ID ?? "";
		case "node.hostname":
			return node.Description?.Hostname ?? "";
		case "node.role":
			return node.Spec?.Role ?? "";
		case "node.platform.os":
			return node.Description?.Platform?.OS ?? "";
		case "node.platform.arch":
			return node.Description?.Platform?.Architecture ?? "";
	}
	const nodeLabel = labelName(key, NODE_LABEL_PREFIX);
	if (nodeLabel !== null) return node.Spec?.Labels?.[nodeLabel] ?? "";
	const engineLabel = labelName(key, ENGINE_LABEL_PREFIX);
	if (engineLabel !== null) {
		return node.Description?.Engine?.Labels?.[engineLabel] ?? "";
	}
	return undefined;
};

export const matchConstraint = (
	node: CapacityNode,
	expression: string,
): boolean | "unknown" => {
	const constraint = parseConstraint(expression);
	if (!constraint) return "unknown";
	const actual = nodeAttribute(node, constraint.key);
	if (actual === undefined) return "unknown";
	// swarmkit compares constraint values case-insensitively.
	const equal = actual.toLowerCase() === constraint.value.toLowerCase();
	return constraint.operator === "==" ? equal : !equal;
};

export const evaluateNodeEligibility = (
	node: CapacityNode,
	constraints: string[],
): { eligibility: Eligibility; reason: string | null } => {
	const state = node.Status?.State;
	if (state !== "ready") {
		return {
			eligibility: "ineligible",
			reason: `Node is ${state ?? "unknown"}`,
		};
	}
	const availability = node.Spec?.Availability;
	if (availability !== "active") {
		return {
			eligibility: "ineligible",
			reason: `Node availability is ${availability ?? "unknown"}`,
		};
	}

	let unknown: string | null = null;
	for (const constraint of constraints) {
		const result = matchConstraint(node, constraint);
		if (result === false) {
			return {
				eligibility: "ineligible",
				reason: `Does not match ${constraint.trim()}`,
			};
		}
		if (result === "unknown" && !unknown) {
			unknown = `Cannot evaluate ${constraint.trim()}`;
		}
	}
	return unknown
		? { eligibility: "unknown", reason: unknown }
		: { eligibility: "eligible", reason: null };
};

const TERMINAL_TASK_STATES = new Set([
	"complete",
	"shutdown",
	"failed",
	"rejected",
	"orphaned",
	"remove",
]);

// swarmkit frees a task's reservation only once its observed state moves past
// running, whatever its desired state: a task that is shutting down, or a
// start-first replacement that is not running yet, still occupies its node.
const holdsReservation = (task: CapacityTask) =>
	!!task.NodeID && !TERMINAL_TASK_STATES.has(task.Status?.State ?? "");

const slotsFor = (available: number, perReplica: number) =>
	perReplica > 0
		? Math.floor(Math.max(0, available) / perReplica)
		: Number.POSITIVE_INFINITY;

/**
 * Estimates how many replicas of a service Swarm can place, from node
 * resources and the reservations of every task that still holds one, except
 * the service's own current replicas.
 *
 * Replicas are identical, so a request fits exactly when the per-node slot
 * counts add up to at least the requested number, whatever order Swarm's
 * spread strategy places them in. Limits are never counted as reserved.
 */
export const computeCapacity = ({
	nodes,
	tasks,
	serviceId,
	requirements,
}: {
	nodes: CapacityNode[];
	tasks: CapacityTask[];
	serviceId: string | null;
	requirements: PlacementRequirements;
}): CapacityReport => {
	const reservedByOthers = new Map<string, { cpu: number; memory: number }>();
	const appReplicas = new Map<string, number>();
	for (const task of tasks) {
		if (!task.NodeID || !holdsReservation(task)) continue;
		if (
			serviceId &&
			task.ServiceID === serviceId &&
			task.DesiredState === "running"
		) {
			appReplicas.set(task.NodeID, (appReplicas.get(task.NodeID) ?? 0) + 1);
			continue;
		}
		const reservations = task.Spec?.Resources?.Reservations;
		const entry = reservedByOthers.get(task.NodeID) ?? { cpu: 0, memory: 0 };
		entry.cpu += reservations?.NanoCPUs ?? 0;
		entry.memory += reservations?.MemoryBytes ?? 0;
		reservedByOthers.set(task.NodeID, entry);
	}

	const perNodeCap = Math.min(
		requirements.maxReplicasPerNode ?? Number.POSITIVE_INFINITY,
		requirements.hostPorts.length > 0 ? 1 : Number.POSITIVE_INFINITY,
	);

	const report: NodeCapacity[] = nodes
		.filter((node) => node.ID)
		.map((node) => {
			const id = node.ID as string;
			const { eligibility, reason } = evaluateNodeEligibility(
				node,
				requirements.constraints,
			);
			const reserved = reservedByOthers.get(id) ?? { cpu: 0, memory: 0 };
			const cpuTotal = node.Description?.Resources?.NanoCPUs ?? 0;
			const memoryTotal = node.Description?.Resources?.MemoryBytes ?? 0;
			const cpuAvailable = cpuTotal - reserved.cpu;
			const memoryAvailable = memoryTotal - reserved.memory;
			const slots =
				eligibility === "ineligible"
					? 0
					: Math.min(
							slotsFor(cpuAvailable, requirements.cpuReservation),
							slotsFor(memoryAvailable, requirements.memoryReservation),
							perNodeCap,
						);
			return {
				id,
				hostname: node.Description?.Hostname ?? null,
				role: node.Spec?.Role ?? null,
				state: node.Status?.State ?? null,
				availability: node.Spec?.Availability ?? null,
				eligibility,
				reason,
				cpu: {
					total: cpuTotal,
					reservedByOthers: reserved.cpu,
					available: Math.max(0, cpuAvailable),
				},
				memory: {
					total: memoryTotal,
					reservedByOthers: reserved.memory,
					available: Math.max(0, memoryAvailable),
				},
				appReplicas: appReplicas.get(id) ?? 0,
				slots: Number.isFinite(slots) ? slots : null,
			};
		});

	const eligible = report.filter((node) => node.eligibility === "eligible");
	const placeable = eligible.some((node) => node.slots === null)
		? null
		: eligible.reduce((sum, node) => sum + (node.slots ?? 0), 0);

	return {
		requirements,
		nodes: report,
		eligibleNodes: eligible.length,
		unknownNodes: report.filter((node) => node.eligibility === "unknown")
			.length,
		eligibleCpu: eligible.reduce((sum, node) => sum + node.cpu.total, 0),
		placeable,
	};
};

export type CapacityWarningCode =
	| "insufficient_capacity"
	| "no_eligible_nodes"
	| "capacity_unknown"
	| "no_reservations"
	| "host_ports"
	| "image_not_distributed"
	| "volumes_per_node"
	| "manager_pin"
	| "unavailable_nodes";

export interface CapacityWarning {
	code: CapacityWarningCode;
	severity: "warning" | "info";
	message: string;
}

export interface CapacityContext {
	imageOnBuildNodeOnly: boolean;
	hasVolumeMounts: boolean;
	defaultManagerPin: boolean;
	/** Where the user sets reservations; defaults to the Resources card. */
	reservationsHint?: string;
	/** How to make the image pullable; defaults to the application's registry. */
	registryHint?: string;
}

export type CapacityFit = "fits" | "insufficient" | "unknown";

export const evaluateCapacity = (
	report: CapacityReport,
	requested: number,
	context: CapacityContext,
): { fit: CapacityFit; warnings: CapacityWarning[] } => {
	const { requirements } = report;
	const warnings: CapacityWarning[] = [];
	const unlimited = report.placeable === null;
	const enoughOnKnownNodes =
		unlimited || (report.placeable as number) >= requested;

	let fit: CapacityFit = "fits";
	if (!enoughOnKnownNodes) {
		fit = report.unknownNodes > 0 ? "unknown" : "insufficient";
	}

	if (report.eligibleNodes === 0 && report.unknownNodes === 0) {
		warnings.push({
			code: "no_eligible_nodes",
			severity: "warning",
			message:
				"No node is ready, active and matches the placement constraints, so no replica can be placed.",
		});
	} else if (fit === "insufficient") {
		warnings.push({
			code: "insufficient_capacity",
			severity: "warning",
			message: `Only ${report.placeable} of ${requested} replicas fit on the eligible nodes with the current reservations and placement limits. Swarm keeps the rest pending until room frees up.`,
		});
	}

	if (report.unknownNodes > 0) {
		warnings.push({
			code: "capacity_unknown",
			severity: "info",
			message:
				"Some placement constraints cannot be evaluated here, so the estimate covers only the nodes known to match.",
		});
	}

	if (
		requirements.cpuReservation === 0 &&
		requirements.memoryReservation === 0
	) {
		const limitsOnly =
			requirements.cpuLimit > 0 || requirements.memoryLimit > 0
				? " Limits cap what a replica may use but reserve nothing."
				: "";
		warnings.push({
			code: "no_reservations",
			severity: "info",
			message: `No CPU or memory reservation is set, so Swarm will place replicas even on nodes that are already busy.${limitsOnly} ${context.reservationsHint ?? "Set reservations under Resources"} to make capacity checks meaningful.`,
		});
	}

	if (requirements.hostPorts.length > 0 && requested > 1) {
		warnings.push({
			code: "host_ports",
			severity: "info",
			message: `Port ${requirements.hostPorts.join(", ")} is published in host mode, so each node can run only one replica.`,
		});
	}

	const multiNode = report.eligibleNodes + report.unknownNodes > 1;
	if (multiNode && context.imageOnBuildNodeOnly) {
		warnings.push({
			code: "image_not_distributed",
			severity: "warning",
			message: `The image is built on the server and not pushed to a registry, so replicas on other nodes cannot pull it. ${context.registryHint ?? "Select a registry in Advanced → Cluster Settings, or place the application on a single node."}`,
		});
	}

	if (multiNode && context.hasVolumeMounts) {
		warnings.push({
			code: "volumes_per_node",
			severity: "info",
			message:
				"Volumes are local to each node, so replicas on different nodes do not share data.",
		});
	}

	if (context.defaultManagerPin) {
		warnings.push({
			code: "manager_pin",
			severity: "info",
			message:
				"Replicas run only on manager nodes because the application has mounts and no placement is set.",
		});
	}

	const unavailable = report.nodes.filter(
		(node) => node.state !== "ready" || node.availability !== "active",
	).length;
	if (unavailable > 0) {
		warnings.push({
			code: "unavailable_nodes",
			severity: "info",
			message: `${unavailable} node(s) are down, paused or drained and receive no new replicas.`,
		});
	}

	return { fit, warnings };
};
