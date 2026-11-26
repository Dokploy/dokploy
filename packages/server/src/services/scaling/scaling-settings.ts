import type {
	PlacementSwarm,
	UpdateConfigSwarm,
} from "@dokploy/server/db/schema";
import { parseConstraint } from "./capacity";

const NANOS_PER_SECOND = 1_000_000_000;

export type RolloutOrder = "start-first" | "stop-first";
export type RolloutFailureAction = "rollback" | "pause" | "continue";

export interface RolloutSettings {
	strategy: RolloutOrder;
	batchSize: number;
	delaySeconds: number;
	monitorSeconds: number;
	failureAction: RolloutFailureAction;
	maxFailureRatioPercent: number;
}

// Matches what Dokploy deploys when no update config is stored; Swarm itself
// monitors each updated task for 5s when no monitor period is given.
export const DEFAULT_ROLLOUT: RolloutSettings = {
	strategy: "start-first",
	batchSize: 1,
	delaySeconds: 0,
	monitorSeconds: 5,
	failureAction: "rollback",
	maxFailureRatioPercent: 0,
};

export const toUpdateConfig = (
	settings: RolloutSettings,
): UpdateConfigSwarm => ({
	Parallelism: settings.batchSize,
	Order: settings.strategy,
	Delay: settings.delaySeconds * NANOS_PER_SECOND,
	Monitor: settings.monitorSeconds * NANOS_PER_SECOND,
	FailureAction: settings.failureAction,
	MaxFailureRatio: settings.maxFailureRatioPercent / 100,
});

// Swarm rolls back with RollbackConfig, not UpdateConfig. Keeping order and
// batch size aligned means a rollback has the same port and capacity needs as
// the update it reverts; other rollback fields set elsewhere are kept.
export const toRollbackConfig = (
	existing: UpdateConfigSwarm | null | undefined,
	settings: RolloutSettings,
): UpdateConfigSwarm => ({
	...existing,
	Parallelism: settings.batchSize,
	Order: settings.strategy,
});

export const fromUpdateConfig = (
	config: UpdateConfigSwarm | null | undefined,
): RolloutSettings & { isDefault: boolean } => {
	if (!config) return { ...DEFAULT_ROLLOUT, isDefault: true };
	const failureAction = ["rollback", "pause", "continue"].includes(
		config.FailureAction ?? "",
	)
		? (config.FailureAction as RolloutFailureAction)
		: "pause";
	return {
		strategy: config.Order === "start-first" ? "start-first" : "stop-first",
		batchSize: config.Parallelism,
		delaySeconds: Math.round((config.Delay ?? 0) / NANOS_PER_SECOND),
		monitorSeconds: config.Monitor
			? Math.round(config.Monitor / NANOS_PER_SECOND)
			: DEFAULT_ROLLOUT.monitorSeconds,
		failureAction,
		maxFailureRatioPercent: Math.round((config.MaxFailureRatio ?? 0) * 100),
		isDefault: false,
	};
};

export type NodeTarget =
	| "any"
	| "managers"
	| "workers"
	| "node"
	| "nodes"
	| "pool";

/** Swarm node label that groups VMs into pools. */
export const POOL_LABEL = "dokploy.pool";

/**
 * Swarm ANDs constraints, so "node A or node B" cannot be written as one.
 * Several chosen nodes instead get a label of the service's own, and the
 * service is pinned to it.
 */
export const SELECTION_LABEL_PREFIX = "dokploy.placement.";

export const selectionLabelFor = (swarmServiceName: string) =>
	`${SELECTION_LABEL_PREFIX}${swarmServiceName}`;

export interface PlacementSelection {
	nodeTarget: NodeTarget;
	hostname: string | null;
	pool: string | null;
	selectionLabel?: string | null;
	maxReplicasPerNode: number;
}

export interface PlacementSettings extends PlacementSelection {
	selectionLabel: string | null;
	otherConstraints: string[];
	usesDefaultManagerPin: boolean;
}

const DEFAULT_MANAGER_PIN = "node.role==manager";

type Target = Required<
	Pick<
		PlacementSelection,
		"nodeTarget" | "hostname" | "pool" | "selectionLabel"
	>
>;

const target = (
	nodeTarget: NodeTarget,
	fields: Partial<Omit<Target, "nodeTarget">> = {},
): Target => ({
	nodeTarget,
	hostname: null,
	pool: null,
	selectionLabel: null,
	...fields,
});

const asTarget = (expression: string): Target | null => {
	const constraint = parseConstraint(expression);
	if (constraint?.operator !== "==") return null;
	const key = constraint.key.toLowerCase();
	if (key === "node.hostname") {
		return target("node", { hostname: constraint.value });
	}
	// Label names are case-sensitive in Swarm, so the key is compared as is.
	if (constraint.key === `node.labels.${POOL_LABEL}`) {
		return target("pool", { pool: constraint.value });
	}
	if (
		constraint.key.startsWith(`node.labels.${SELECTION_LABEL_PREFIX}`) &&
		constraint.value === "true"
	) {
		return target("nodes", {
			selectionLabel: constraint.key.slice("node.labels.".length),
		});
	}
	if (key === "node.role") {
		const role = constraint.value.toLowerCase();
		if (role === "manager") return target("managers");
		if (role === "worker") return target("workers");
	}
	return null;
};

const TARGET_PRIORITY: NodeTarget[] = [
	"node",
	"nodes",
	"pool",
	"managers",
	"workers",
];

// The card owns exactly one constraint: the first hostname pin, otherwise the
// first node selection, then the first pool, then the first role pin. Every
// other constraint, including a second pin written in Swarm Settings, is
// shown and preserved as it is.
const findTarget = (constraints: string[]) => {
	const targets = constraints.map(asTarget);
	for (const kind of TARGET_PRIORITY) {
		const index = targets.findIndex((target) => target?.nodeTarget === kind);
		if (index >= 0) return { index, target: targets[index] ?? null };
	}
	return { index: -1, target: null };
};

export const readPlacementSettings = (
	placement: PlacementSwarm | null | undefined,
	hasMounts: boolean,
): PlacementSettings => {
	const usesDefaultManagerPin = !placement && hasMounts;
	const constraints = placement
		? (placement.Constraints ?? [])
		: usesDefaultManagerPin
			? [DEFAULT_MANAGER_PIN]
			: [];
	const { index, target: found } = findTarget(constraints);

	return {
		nodeTarget: found?.nodeTarget ?? "any",
		hostname: found?.hostname ?? null,
		pool: found?.pool ?? null,
		selectionLabel: found?.selectionLabel ?? null,
		maxReplicasPerNode: placement?.MaxReplicas ?? 0,
		otherConstraints: constraints.filter((_, position) => position !== index),
		usesDefaultManagerPin,
	};
};

export const targetConstraint = (
	selection: Pick<
		PlacementSelection,
		"nodeTarget" | "hostname" | "pool" | "selectionLabel"
	>,
) =>
	selection.nodeTarget === "managers"
		? "node.role==manager"
		: selection.nodeTarget === "workers"
			? "node.role==worker"
			: selection.nodeTarget === "node" && selection.hostname
				? `node.hostname==${selection.hostname}`
				: selection.nodeTarget === "pool" && selection.pool
					? `node.labels.${POOL_LABEL}==${selection.pool}`
					: selection.nodeTarget === "nodes" && selection.selectionLabel
						? `node.labels.${selection.selectionLabel}==true`
						: null;

export const applyPlacementSelection = (
	existing: PlacementSwarm | null | undefined,
	selection: PlacementSelection,
): PlacementSwarm => {
	const constraints = existing?.Constraints ?? [];
	const { index } = findTarget(constraints);
	const others = constraints.filter((_, position) => position !== index);
	const target = targetConstraint(selection);

	// Always stored explicitly: a null placement makes apps with mounts fall
	// back to the manager pin, which would override an explicit "any node".
	return {
		...(existing?.Preferences && { Preferences: existing.Preferences }),
		...(existing?.Platforms && { Platforms: existing.Platforms }),
		Constraints: target ? [...others, target] : others,
		...(selection.maxReplicasPerNode > 0 && {
			MaxReplicas: selection.maxReplicasPerNode,
		}),
	};
};
