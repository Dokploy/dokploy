import { createSlidingWindowLimiter } from "@dokploy/server/services/scaling/rate-limit";
import {
	getConfiguredReplicas,
	getServiceMode,
} from "@dokploy/server/services/scaling/replicas";
import { describe, expect, it } from "vitest";

describe("getServiceMode", () => {
	it.each([
		[null, "replicated"],
		[{ Replicated: { Replicas: 2 } }, "replicated"],
		[{ Global: {} }, "global"],
		[{ ReplicatedJob: {} }, "replicated-job"],
		[{ GlobalJob: {} }, "global-job"],
	] as const)("%j is %s", (modeSwarm, expected) => {
		expect(getServiceMode(modeSwarm)).toBe(expected);
	});
});

describe("getConfiguredReplicas", () => {
	it("uses the replicas column when no mode override exists", () => {
		expect(getConfiguredReplicas({ replicas: 3, modeSwarm: null })).toBe(3);
	});

	it("prefers an explicit replicated mode, which is what gets deployed", () => {
		expect(
			getConfiguredReplicas({
				replicas: 3,
				modeSwarm: { Replicated: { Replicas: 5 } },
			}),
		).toBe(5);
	});

	it("falls back to one task for a replicated mode without a count", () => {
		expect(
			getConfiguredReplicas({ replicas: 3, modeSwarm: { Replicated: {} } }),
		).toBe(1);
	});
});

describe("createSlidingWindowLimiter", () => {
	it("allows up to the limit per key inside the window", () => {
		let now = 0;
		const limiter = createSlidingWindowLimiter({
			limit: 2,
			windowMs: 1_000,
			now: () => now,
		});

		expect(limiter.tryConsume("app-1")).toBe(true);
		expect(limiter.tryConsume("app-1")).toBe(true);
		expect(limiter.tryConsume("app-1")).toBe(false);
		expect(limiter.tryConsume("app-2")).toBe(true);

		now = 1_000;
		expect(limiter.tryConsume("app-1")).toBe(true);
	});
});
