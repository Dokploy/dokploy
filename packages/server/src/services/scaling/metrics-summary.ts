export interface TaskSample {
	timestamp: string;
	service: string;
	taskId: string;
	slot: number;
	nodeId: string;
	containerId: string;
	cpuCores: number;
	memoryBytes: number;
	memoryLimitBytes: number;
}

export type BasisSource = "reservation" | "limit";

export interface ResourceBasis {
	cpuCores: number | null;
	cpuSource: BasisSource | null;
	memoryBytes: number | null;
	memorySource: BasisSource | null;
}

const NANO_CPUS_PER_CORE = 1_000_000_000;

const amount = (value: string | null | undefined) => {
	const parsed = value ? Number.parseInt(value, 10) : 0;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const pick = (reservation: string | null, limit: string | null) => {
	if (amount(reservation)) {
		return { value: amount(reservation), source: "reservation" as const };
	}
	if (amount(limit)) return { value: amount(limit), source: "limit" as const };
	return { value: null, source: null };
};

// Utilization is measured against what a replica was promised (its
// reservation) or, failing that, allowed (its limit). Without either there is
// nothing meaningful to divide by.
export const resourceBasis = (resources: {
	cpuReservation: string | null;
	cpuLimit: string | null;
	memoryReservation: string | null;
	memoryLimit: string | null;
}): ResourceBasis => {
	const cpu = pick(resources.cpuReservation, resources.cpuLimit);
	const memory = pick(resources.memoryReservation, resources.memoryLimit);
	return {
		cpuCores: cpu.value === null ? null : cpu.value / NANO_CPUS_PER_CORE,
		cpuSource: cpu.source,
		memoryBytes: memory.value,
		memorySource: memory.source,
	};
};

export interface ReplicaMetrics {
	taskId: string;
	slot: number | null;
	nodeId: string | null;
	sampledAt: string | null;
	fresh: boolean;
	cpuCores: number | null;
	memoryBytes: number | null;
	cpuPercent: number | null;
	memoryPercent: number | null;
}

const percentOf = (value: number, basis: number | null) =>
	basis ? (value / basis) * 100 : null;

const average = (values: number[]) =>
	values.length
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: null;

/**
 * Latest reading of each ready replica, and the averages over replicas whose
 * reading is fresh. A ready replica without a fresh reading is reported, not
 * guessed: callers decide what missing data means (the autoscaler never scales
 * down on it).
 */
export const summarizeReplicaMetrics = ({
	samples,
	readyReplicas,
	basis,
	now,
	staleAfterMs,
}: {
	samples: TaskSample[];
	readyReplicas: { taskId: string; slot: number | null }[];
	basis: ResourceBasis;
	now: number;
	staleAfterMs: number;
}) => {
	const latest = new Map<string, TaskSample>();
	for (const sample of samples) {
		const current = latest.get(sample.taskId);
		if (
			!current ||
			Date.parse(sample.timestamp) > Date.parse(current.timestamp)
		) {
			latest.set(sample.taskId, sample);
		}
	}

	const replicas: ReplicaMetrics[] = readyReplicas.map(({ taskId, slot }) => {
		const sample = latest.get(taskId);
		if (!sample) {
			return {
				taskId,
				slot,
				nodeId: null,
				sampledAt: null,
				fresh: false,
				cpuCores: null,
				memoryBytes: null,
				cpuPercent: null,
				memoryPercent: null,
			};
		}
		return {
			taskId,
			slot,
			nodeId: sample.nodeId,
			sampledAt: sample.timestamp,
			fresh: now - Date.parse(sample.timestamp) <= staleAfterMs,
			cpuCores: sample.cpuCores,
			memoryBytes: sample.memoryBytes,
			cpuPercent: percentOf(sample.cpuCores, basis.cpuCores),
			memoryPercent: percentOf(sample.memoryBytes, basis.memoryBytes),
		};
	});

	const fresh = replicas.filter((replica) => replica.fresh);
	const cpuCores = average(fresh.map((replica) => replica.cpuCores ?? 0));
	const memoryBytes = average(fresh.map((replica) => replica.memoryBytes ?? 0));
	return {
		replicas,
		basis,
		averages: {
			cpuCores,
			memoryBytes,
			cpuPercent:
				cpuCores === null ? null : percentOf(cpuCores, basis.cpuCores),
			memoryPercent:
				memoryBytes === null ? null : percentOf(memoryBytes, basis.memoryBytes),
		},
		coverage: { ready: replicas.length, fresh: fresh.length },
	};
};

export interface SeriesPoint {
	t: number;
	cpuCores: number;
	memoryBytes: number;
}

export interface ReplicaSeries {
	slot: number;
	nodeId: string;
	points: SeriesPoint[];
}

// Averages consecutive points into at most maxPoints buckets, so a long range
// stays cheap to send and draw while keeping its shape.
const downsample = (points: SeriesPoint[], maxPoints: number) => {
	if (points.length <= maxPoints) return points;
	const size = Math.ceil(points.length / maxPoints);
	const buckets: SeriesPoint[] = [];
	for (let start = 0; start < points.length; start += size) {
		const bucket = points.slice(start, start + size);
		buckets.push({
			t: bucket[bucket.length - 1]?.t ?? 0,
			cpuCores: average(bucket.map((point) => point.cpuCores)) ?? 0,
			memoryBytes: average(bucket.map((point) => point.memoryBytes)) ?? 0,
		});
	}
	return buckets;
};

// Series follow the replica slot, not the task: when Swarm replaces a task the
// slot keeps its identity, so a chart line stays one replica over time.
export const toReplicaSeries = (
	samples: TaskSample[],
	maxPoints = 240,
): ReplicaSeries[] => {
	const bySlot = new Map<number, ReplicaSeries>();
	for (const sample of samples) {
		const series = bySlot.get(sample.slot) ?? {
			slot: sample.slot,
			nodeId: sample.nodeId,
			points: [],
		};
		series.nodeId = sample.nodeId;
		series.points.push({
			t: Date.parse(sample.timestamp),
			cpuCores: sample.cpuCores,
			memoryBytes: sample.memoryBytes,
		});
		bySlot.set(sample.slot, series);
	}
	return [...bySlot.values()]
		.map((series) => ({
			...series,
			points: downsample(
				series.points.sort((a, b) => a.t - b.t),
				maxPoints,
			),
		}))
		.sort((a, b) => a.slot - b.slot);
};
