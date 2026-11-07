import { toMb } from "./units";
import type { Container } from "./utils";

const MEMORY_UNIT_BYTES: Record<string, number> = {
	B: 1,
	KiB: 1024,
	MiB: 1024 ** 2,
	GiB: 1024 ** 3,
	TiB: 1024 ** 4,
};

const memoryToBytes = (value: string | undefined) => {
	const parsed = Number.parseFloat(value ?? "");
	if (Number.isNaN(parsed)) {
		return 0;
	}
	const unit = (value ?? "").replace(/[0-9.\s]/g, "");
	return parsed * (MEMORY_UNIT_BYTES[unit] ?? 1);
};

const splitPair = (value: string) => {
	const [first, second] = value.split(" / ");
	return [first ?? "", second ?? ""] as const;
};

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

const toMiB = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(2)}MiB`;

const sumPairMb = (stats: Container[], field: "NetIO" | "BlockIO") => {
	const pairs = stats.map((stat) => splitPair(stat[field]));
	const first = sum(pairs.map(([value]) => toMb(value)));
	const second = sum(pairs.map(([, value]) => toMb(value)));
	return `${first.toFixed(6)}MB / ${second.toFixed(6)}MB`;
};

/**
 * Merges the `docker stats` rows of all replicas of one service into one row,
 * so the service graph shows the total instead of a single replica.
 */
export const combineContainerStats = (
	stats: Container[],
	hostMemoryBytes: number,
): Container | undefined => {
	if (stats.length <= 1) {
		return stats[0];
	}

	const memory = stats.map((stat) => splitPair(stat.MemUsage));
	const usedBytes = sum(memory.map(([used]) => memoryToBytes(used)));
	// Replicas without a memory limit each report the host memory as their
	// limit, so the plain sum would exceed what the host has.
	const limitBytes = Math.min(
		sum(memory.map(([, limit]) => memoryToBytes(limit))),
		hostMemoryBytes,
	);

	return {
		CPUPerc: `${sum(stats.map((stat) => Number.parseFloat(stat.CPUPerc) || 0)).toFixed(2)}%`,
		MemPerc: `${(limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0).toFixed(2)}%`,
		MemUsage: `${toMiB(usedBytes)} / ${toMiB(limitBytes)}`,
		NetIO: sumPairMb(stats, "NetIO"),
		BlockIO: sumPairMb(stats, "BlockIO"),
		Container: stats.map((stat) => stat.Container).join(","),
		ID: stats.map((stat) => stat.ID).join(","),
		Name: stats.map((stat) => stat.Name).join(","),
	};
};
