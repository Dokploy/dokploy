import {
	normalizeSwarmHealthCheck,
	normalizeSwarmHealthCheckTest,
} from "@dokploy/server/utils/docker/health-check";
import { generateConfigContainer } from "@dokploy/server/utils/docker/utils";
import { describe, expect, it } from "vitest";

describe("Swarm health check normalization", () => {
	it("preserves a valid exec-form health check", () => {
		expect(normalizeSwarmHealthCheckTest(["CMD", "curl", "-f", "/"])).toEqual([
			"CMD",
			"curl",
			"-f",
			"/",
		]);
	});

	it("parses a JSON array pasted into a single Test field", () => {
		expect(
			normalizeSwarmHealthCheckTest([
				'["CMD","curl","-f","http://localhost:8080/"]',
			]),
		).toEqual(["CMD", "curl", "-f", "http://localhost:8080/"]);
	});

	it("wraps a single command as CMD-SHELL", () => {
		expect(
			normalizeSwarmHealthCheckTest(["curl -f http://localhost/"]),
		).toEqual(["CMD-SHELL", "curl -f http://localhost/"]);
	});

	it("keeps bracket-style shell conditions as shell commands", () => {
		expect(normalizeSwarmHealthCheckTest(["[ -f /tmp/ready ]"])).toEqual([
			"CMD-SHELL",
			"[ -f /tmp/ready ]",
		]);
	});

	it("turns a legacy blank Test value into an explicit disabled health check", () => {
		expect(normalizeSwarmHealthCheckTest([""])).toEqual(["NONE"]);
	});

	it("omits a completely empty health check", () => {
		expect(normalizeSwarmHealthCheck({ Test: [] })).toBeUndefined();
	});

	it("preserves timing options when Test is absent", () => {
		expect(
			normalizeSwarmHealthCheck({
				Test: [],
				Interval: 10_000_000_000,
				Retries: 3,
			}),
		).toEqual({ Interval: 10_000_000_000, Retries: 3 });
	});

	it("rejects malformed pasted JSON", () => {
		expect(() => normalizeSwarmHealthCheckTest(['["CMD",'])).toThrow(
			"Health check Test must be a JSON array of strings",
		);
	});

	it("rejects pasted JSON arrays containing non-string values", () => {
		expect(() => normalizeSwarmHealthCheckTest(['["CMD",42]'])).toThrow(
			"Health check Test must be a JSON array of strings",
		);
	});

	it("rejects an unsupported multi-item instruction", () => {
		expect(() => normalizeSwarmHealthCheckTest(["curl", "-f", "/"])).toThrow(
			"Health check Test must begin with CMD, CMD-SHELL, or NONE",
		);
	});

	it("rejects NONE combined with another command", () => {
		expect(() => normalizeSwarmHealthCheckTest(["NONE", "curl /"])).toThrow(
			"NONE cannot be combined with another health check command",
		);
	});

	it("normalizes health checks at the Docker service boundary", () => {
		const config = generateConfigContainer({
			healthCheckSwarm: {
				Test: ['["CMD-SHELL","wget -q --spider http://localhost/"]'],
				Interval: 5_000_000_000,
			},
		});

		expect(config.HealthCheck).toEqual({
			Test: ["CMD-SHELL", "wget -q --spider http://localhost/"],
			Interval: 5_000_000_000,
		});
	});

	it("does not add a Docker health check when none is configured", () => {
		const config = generateConfigContainer({ healthCheckSwarm: null });

		expect(config).not.toHaveProperty("HealthCheck");
	});
});
