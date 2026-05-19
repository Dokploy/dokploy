import { describe, expect, test } from "vitest";
import {
	buildUpdateConfigSwarm,
	getDeploymentStrategy,
	getEffectiveInstances,
	isValidInstanceCount,
} from "@/components/dashboard/application/general/scaling-and-rollouts";

describe("application scaling and rollout helpers", () => {
	test("uses replicated swarm mode replicas before the application replica field", () => {
		expect(getEffectiveInstances(2, { Replicated: { Replicas: 5 } })).toBe(5);
		expect(getEffectiveInstances(3, null)).toBe(3);
		expect(getEffectiveInstances(undefined, null)).toBe(1);
	});

	test("maps docker swarm update order to the exposed deployment strategy", () => {
		expect(getDeploymentStrategy({ Parallelism: 1, Order: "stop-first" })).toBe(
			"standard",
		);
		expect(
			getDeploymentStrategy({ Parallelism: 1, Order: "start-first" }),
		).toBe("zero-downtime");
		expect(getDeploymentStrategy(null)).toBe("zero-downtime");
		expect(getDeploymentStrategy(undefined)).toBe("zero-downtime");
	});

	test("builds update config while preserving advanced rollout settings", () => {
		expect(
			buildUpdateConfigSwarm(
				{
					Parallelism: 2,
					Delay: 10,
					FailureAction: "pause",
					Monitor: 20,
					MaxFailureRatio: 0.5,
					Order: "start-first",
				},
				"standard",
			),
		).toEqual({
			Parallelism: 2,
			Delay: 10,
			FailureAction: "pause",
			Monitor: 20,
			MaxFailureRatio: 0.5,
			Order: "stop-first",
		});
	});

	test("defaults new update config to one-at-a-time rollback-safe start-first rollouts", () => {
		expect(buildUpdateConfigSwarm(null, "zero-downtime")).toEqual({
			Parallelism: 1,
			FailureAction: "rollback",
			Order: "start-first",
		});
	});

	test("requires a positive whole number of instances", () => {
		expect(isValidInstanceCount(1)).toBe(true);
		expect(isValidInstanceCount(3)).toBe(true);
		expect(isValidInstanceCount(0)).toBe(false);
		expect(isValidInstanceCount(1.5)).toBe(false);
	});
});
