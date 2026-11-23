import {
	resourceBasis,
	summarizeReplicaMetrics,
	type TaskSample,
	toReplicaSeries,
} from "@dokploy/server/services/scaling/metrics-summary";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const MIB = 1024 * 1024;

const sample = (overrides: Partial<TaskSample>): TaskSample => ({
	timestamp: new Date(NOW - 10_000).toISOString(),
	service: "web",
	taskId: "t1",
	slot: 1,
	nodeId: "n1",
	containerId: "c1",
	cpuCores: 0.5,
	memoryBytes: 256 * MIB,
	memoryLimitBytes: 0,
	...overrides,
});

const noResources = {
	cpuReservation: null,
	cpuLimit: null,
	memoryReservation: null,
	memoryLimit: null,
};

describe("resourceBasis", () => {
	it("prefers the reservation, then the limit", () => {
		expect(
			resourceBasis({
				...noResources,
				cpuReservation: "500000000",
				cpuLimit: "2000000000",
				memoryLimit: String(512 * MIB),
			}),
		).toEqual({
			cpuCores: 0.5,
			cpuSource: "reservation",
			memoryBytes: 512 * MIB,
			memorySource: "limit",
		});
	});

	it("has nothing to compare with when neither is set", () => {
		expect(resourceBasis({ ...noResources, cpuLimit: "0" })).toEqual({
			cpuCores: null,
			cpuSource: null,
			memoryBytes: null,
			memorySource: null,
		});
	});
});

describe("summarizeReplicaMetrics", () => {
	const basis = resourceBasis({
		...noResources,
		cpuReservation: "1000000000",
		memoryReservation: String(512 * MIB),
	});

	it("uses each ready replica's latest reading and averages the fresh ones", () => {
		const summary = summarizeReplicaMetrics({
			samples: [
				sample({
					taskId: "t1",
					cpuCores: 0.2,
					timestamp: new Date(NOW - 40_000).toISOString(),
				}),
				sample({ taskId: "t1", cpuCores: 0.4 }),
				sample({
					taskId: "t2",
					slot: 2,
					cpuCores: 0.8,
					memoryBytes: 128 * MIB,
				}),
			],
			readyReplicas: [
				{ taskId: "t1", slot: 1 },
				{ taskId: "t2", slot: 2 },
			],
			basis,
			now: NOW,
			staleAfterMs: 45_000,
		});

		expect(summary.coverage).toEqual({ ready: 2, fresh: 2 });
		expect(summary.replicas[0]).toMatchObject({
			cpuCores: 0.4,
			cpuPercent: 40,
		});
		expect(summary.averages.cpuCores).toBeCloseTo(0.6);
		expect(summary.averages.cpuPercent).toBeCloseTo(60);
		expect(summary.averages.memoryPercent).toBeCloseTo(37.5);
	});

	it("reports missing and stale readings instead of averaging them in", () => {
		const summary = summarizeReplicaMetrics({
			samples: [
				sample({ taskId: "t1", cpuCores: 0.9 }),
				sample({
					taskId: "t2",
					slot: 2,
					cpuCores: 0.1,
					timestamp: new Date(NOW - 120_000).toISOString(),
				}),
			],
			readyReplicas: [
				{ taskId: "t1", slot: 1 },
				{ taskId: "t2", slot: 2 },
				{ taskId: "t3", slot: 3 },
			],
			basis,
			now: NOW,
			staleAfterMs: 45_000,
		});

		expect(summary.coverage).toEqual({ ready: 3, fresh: 1 });
		expect(summary.replicas.map((replica) => replica.fresh)).toEqual([
			true,
			false,
			false,
		]);
		expect(summary.replicas[2]).toMatchObject({
			sampledAt: null,
			cpuCores: null,
		});
		expect(summary.averages.cpuCores).toBeCloseTo(0.9);
	});

	it("has no averages when nothing is fresh", () => {
		const summary = summarizeReplicaMetrics({
			samples: [],
			readyReplicas: [{ taskId: "t1", slot: 1 }],
			basis,
			now: NOW,
			staleAfterMs: 45_000,
		});
		expect(summary.averages).toEqual({
			cpuCores: null,
			memoryBytes: null,
			cpuPercent: null,
			memoryPercent: null,
		});
	});
});

describe("toReplicaSeries", () => {
	it("keeps one line per slot across task replacements", () => {
		const series = toReplicaSeries([
			sample({
				taskId: "old",
				slot: 1,
				timestamp: new Date(NOW - 30_000).toISOString(),
			}),
			sample({ taskId: "b", slot: 2 }),
			sample({ taskId: "new", slot: 1, nodeId: "n2" }),
		]);

		expect(series.map((line) => line.slot)).toEqual([1, 2]);
		expect(series[0]?.points).toHaveLength(2);
		expect(series[0]?.nodeId).toBe("n2");
	});

	it("averages long ranges down to the point budget", () => {
		const samples = Array.from({ length: 100 }, (_, index) =>
			sample({
				cpuCores: index,
				timestamp: new Date(NOW - (100 - index) * 15_000).toISOString(),
			}),
		);
		const [line] = toReplicaSeries(samples, 10);

		expect(line?.points).toHaveLength(10);
		expect(line?.points[0]?.cpuCores).toBeCloseTo(4.5);
		expect(line?.points.at(-1)?.t).toBe(
			Date.parse(samples.at(-1)?.timestamp ?? ""),
		);
	});
});
