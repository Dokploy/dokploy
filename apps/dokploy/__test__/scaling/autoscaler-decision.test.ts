import type { AutoscalingState } from "@dokploy/server/db/schema";
import {
	type DecisionInput,
	decideReplicas,
} from "@dokploy/server/services/scaling/autoscaler-decision";
import { describe, expect, it } from "vitest";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const policy = {
	minReplicas: 1,
	maxReplicas: 10,
	cpuTargetPercent: 50,
	memoryTargetPercent: null,
	tolerancePercent: 10,
	scaleUpWindowSeconds: 60,
	scaleDownWindowSeconds: 300,
	cooldownSeconds: 60,
	maxScaleUpStep: 4,
	maxScaleDownStep: 1,
	lastScaledAt: null,
};

const input = (overrides: Partial<DecisionInput> = {}): DecisionInput => ({
	policy,
	state: null,
	now: NOW,
	current: 2,
	blocked: null,
	settling: null,
	pending: null,
	metrics: {
		cpuPercent: 50,
		memoryPercent: 30,
		coverage: { ready: 2, fresh: 2 },
	},
	metricsUnavailable: null,
	...overrides,
});

/** Recommendations as if every evaluation since `seconds` ago asked for n. */
const history = (
	replicas: number,
	seconds: number,
	every = 30,
): AutoscalingState => {
	const recommendations = [];
	for (let age = seconds; age > 0; age -= every) {
		recommendations.push({ at: ago(age), replicas });
	}
	return { recommendations, lastDecision: null, lastEventKey: null };
};

describe("decideReplicas", () => {
	it("keeps the count while usage is within the tolerance of the target", () => {
		const out = decideReplicas(
			input({
				metrics: {
					cpuPercent: 54,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBeNull();
		expect(out.decision).toMatchObject({ action: "hold", recommended: 2 });
		expect(out.decision.reason).toContain("2 replicas is right");
		expect(out.state.recommendations).toHaveLength(1);
	});

	it("asks for ceil(current × usage ÷ target) and waits out the scale-up window", () => {
		const busy = {
			cpuPercent: 120,
			memoryPercent: null,
			coverage: { ready: 2, fresh: 2 },
		};
		const first = decideReplicas(input({ metrics: busy }));
		expect(first.apply).toBeNull();
		expect(first.decision.recommended).toBe(5);
		expect(first.decision.reason).toContain("scale-up window");

		const sustained = decideReplicas(
			input({ metrics: busy, state: history(5, 60) }),
		);
		expect(sustained.apply).toBe(5);
		expect(sustained.decision.action).toBe("scale_up");
	});

	it("scales up by the lowest recommendation in the window, and at most one step", () => {
		const state = history(9, 60);
		state.recommendations[1] = {
			at: state.recommendations[1]!.at,
			replicas: 4,
		};
		const out = decideReplicas(
			input({
				state,
				metrics: {
					cpuPercent: 225,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBe(4);

		const capped = decideReplicas(
			input({
				state: history(9, 60),
				metrics: {
					cpuPercent: 225,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(capped.apply).toBe(6);
		expect(capped.decision.reason).toContain("at most 4 per step");
	});

	it("takes the highest ask across CPU and memory", () => {
		const out = decideReplicas(
			input({
				policy: { ...policy, memoryTargetPercent: 50, scaleUpWindowSeconds: 0 },
				metrics: {
					cpuPercent: 75,
					memoryPercent: 150,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBe(6);
	});

	describe("memory alongside CPU", () => {
		const both = { ...policy, cpuTargetPercent: 70, memoryTargetPercent: 60 };
		// Two idle Next.js replicas after a load test: their baseline memory
		// would have pinned them at 2 under the plain HPA rule.
		const idleBaseline = {
			cpuPercent: 0,
			memoryPercent: 33.5,
			coverage: { ready: 2, fresh: 2 },
		};

		it("leaves removals to CPU while memory is below its target", () => {
			const first = decideReplicas(
				input({ policy: both, metrics: idleBaseline }),
			);
			expect(first.decision.recommended).toBe(1);
			expect(first.decision.reason).toContain("scale-down window");

			const sustained = decideReplicas(
				input({ policy: both, metrics: idleBaseline, state: history(1, 300) }),
			);
			expect(sustained.apply).toBe(1);
			expect(sustained.decision.reason).toBe(
				"CPU 0% (target 70%), Memory 34% (target 60%) over 5 min: removing 1 replica",
			);
		});

		it("holds replicas while memory is at its target, and says which metric holds them", () => {
			const out = decideReplicas(
				input({
					policy: both,
					metrics: {
						cpuPercent: 0,
						memoryPercent: 58,
						coverage: { ready: 2, fresh: 2 },
					},
					state: history(2, 300),
				}),
			);
			expect(out.apply).toBeNull();
			expect(out.decision.recommended).toBe(2);
			expect(out.decision.reason).toBe(
				"CPU 0% (target 70%), Memory 58% (target 60%): memory keeps 2 replicas; CPU alone would run 1 replica",
			);
		});

		it("still adds replicas for memory when CPU is low", () => {
			const out = decideReplicas(
				input({
					policy: { ...both, scaleUpWindowSeconds: 0 },
					metrics: {
						cpuPercent: 10,
						memoryPercent: 80,
						coverage: { ready: 2, fresh: 2 },
					},
				}),
			);
			expect(out.apply).toBe(3);
		});

		it("keeps the HPA rule for memory when it is the only metric with a reading", () => {
			const memoryOnly = decideReplicas(
				input({
					policy: { ...both, cpuTargetPercent: null },
					metrics: idleBaseline,
					state: history(2, 300),
				}),
			);
			expect(memoryOnly.decision.recommended).toBe(2);
			expect(memoryOnly.decision.reason).toContain("2 replicas is right");

			const noCpuBasis = decideReplicas(
				input({
					policy: both,
					metrics: { ...idleBaseline, cpuPercent: null },
					state: history(2, 300),
				}),
			);
			expect(noCpuBasis.decision.recommended).toBe(2);
		});
	});

	it("scales down by the highest recommendation over the scale-down window, one replica at a time", () => {
		const idle = {
			cpuPercent: 5,
			memoryPercent: null,
			coverage: { ready: 4, fresh: 4 },
		};
		const early = decideReplicas(
			input({ current: 4, metrics: idle, state: history(1, 120) }),
		);
		expect(early.apply).toBeNull();
		expect(early.decision.reason).toContain("scale-down window");

		const sustained = decideReplicas(
			input({ current: 4, metrics: idle, state: history(1, 300) }),
		);
		expect(sustained.apply).toBe(3);
		expect(sustained.decision.action).toBe("scale_down");
	});

	it("counts the window from the last recommendation against the change", () => {
		// As on the test server: 2 replicas were right under load for 212s,
		// then the load stopped. The countdown once started at 212s.
		let state: AutoscalingState | null = history(2, 212);
		const idle = {
			cpuPercent: 0,
			memoryPercent: null,
			coverage: { ready: 2, fresh: 2 },
		};
		const reasons: string[] = [];
		let applied: number | null = null;
		let now = NOW;
		while (applied === null && now - NOW <= 600_000) {
			const out = decideReplicas(
				input({ current: 2, metrics: idle, state, now }),
			);
			state = { ...out.state, lastEventKey: null };
			applied = out.apply;
			reasons.push(out.decision.reason);
			now += 30_000;
		}
		expect(reasons[0]).toContain(
			"wants 1 replica for 2s of the 5 min scale-down window",
		);
		expect(reasons[1]).toContain("for 32s of the 5 min scale-down window");
		expect(reasons.slice(0, -1)).toHaveLength(10);
		expect(applied).toBe(1);
		expect(reasons.at(-1)).toContain("over 5 min: removing 1 replica");
	});

	it("reaches the end of a window when evaluations do not land on it", () => {
		const idle = {
			cpuPercent: 0,
			memoryPercent: null,
			coverage: { ready: 3, fresh: 3 },
		};
		const windowed = { ...policy, scaleDownWindowSeconds: 20 };
		let state: AutoscalingState | null = null;
		let now = NOW;
		let applied: number | null = null;
		for (let step = 0; step < 10 && applied === null; step++) {
			const out = decideReplicas(
				input({ policy: windowed, current: 3, metrics: idle, state, now }),
			);
			state = { ...out.state, lastEventKey: null };
			applied = out.apply;
			now += 5_300;
		}
		expect(applied).toBe(2);
		expect(now - NOW).toBeLessThan(40_000);
	});

	it("never scales down on partial data, and counts missing replicas as idle when scaling up", () => {
		const partialIdle = decideReplicas(
			input({
				current: 4,
				policy: { ...policy, scaleDownWindowSeconds: 0 },
				metrics: {
					cpuPercent: 5,
					memoryPercent: null,
					coverage: { ready: 4, fresh: 2 },
				},
			}),
		);
		expect(partialIdle.apply).toBeNull();
		expect(partialIdle.decision.reason).toContain("will not scale down");

		const partialBusy = decideReplicas(
			input({
				current: 4,
				policy: { ...policy, scaleUpWindowSeconds: 0 },
				metrics: {
					cpuPercent: 100,
					memoryPercent: null,
					coverage: { ready: 4, fresh: 2 },
				},
			}),
		);
		// 100% from half the replicas is 50% overall: on target.
		expect(partialBusy.apply).toBeNull();
	});

	it("waits out the cooldown after the last change", () => {
		const out = decideReplicas(
			input({
				policy: {
					...policy,
					scaleUpWindowSeconds: 0,
					lastScaledAt: new Date(NOW - 20_000),
				},
				metrics: {
					cpuPercent: 200,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBeNull();
		expect(out.decision.reason).toContain("cooling down for 40s");
	});

	it("applies the minimum and maximum without waiting for metrics", () => {
		expect(
			decideReplicas(
				input({
					current: 1,
					policy: { ...policy, minReplicas: 3 },
					metrics: null,
				}),
			).apply,
		).toBe(3);
		expect(
			decideReplicas(
				input({
					current: 12,
					metrics: null,
					policy: { ...policy, lastScaledAt: new Date(NOW) },
				}),
			),
		).toMatchObject({ apply: 10, decision: { action: "scale_down" } });
	});

	it("clamps what metrics ask for to the bounds", () => {
		const out = decideReplicas(
			input({
				policy: {
					...policy,
					maxReplicas: 3,
					scaleUpWindowSeconds: 0,
				},
				metrics: {
					cpuPercent: 400,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBe(3);
	});

	it("holds, and forgets the window, while blocked or settling", () => {
		const state = history(5, 60);
		const blocked = decideReplicas(
			input({ state, blocked: "A deployment is in progress" }),
		);
		expect(blocked).toMatchObject({
			apply: null,
			eventKey: null,
			decision: { action: "hold", reason: "A deployment is in progress" },
		});
		expect(blocked.state.recommendations).toEqual([]);

		const settling = decideReplicas(
			input({ state, settling: "1 of 2 replicas are ready" }),
		);
		expect(settling.apply).toBeNull();
		expect(settling.state.recommendations).toEqual([]);
	});

	it("gives missing metrics an event key", () => {
		const out = decideReplicas(
			input({
				metrics: null,
				metricsUnavailable: "Cannot reach the metrics agent",
			}),
		);
		expect(out.eventKey).toBe("metrics:Cannot reach the metrics agent");
		expect(out.decision.reason).toBe("Cannot reach the metrics agent");
	});

	it("needs a reading it can compare with a target", () => {
		const out = decideReplicas(
			input({
				metrics: {
					cpuPercent: null,
					memoryPercent: 40,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.eventKey).toBe("no-basis");
		expect(out.decision.reason).toContain("reservation or a limit");
	});

	it("does not add replicas while others wait for a node", () => {
		const out = decideReplicas(
			input({
				policy: { ...policy, scaleUpWindowSeconds: 0 },
				pending: { count: 1, reason: "insufficient resources on 2 nodes" },
				metrics: {
					cpuPercent: 200,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBeNull();
		expect(out.eventKey).toBe("pending:insufficient resources on 2 nodes");
		expect(out.decision.reason).toContain("insufficient resources");
	});

	it("still removes replicas while some are pending", () => {
		const out = decideReplicas(
			input({
				current: 3,
				policy: { ...policy, scaleDownWindowSeconds: 0 },
				pending: { count: 1, reason: null },
				metrics: {
					cpuPercent: 5,
					memoryPercent: null,
					coverage: { ready: 2, fresh: 2 },
				},
			}),
		);
		expect(out.apply).toBe(2);
	});
});
