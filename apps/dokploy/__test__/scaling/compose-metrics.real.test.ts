import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	composeServiceKey,
	fetchNodeSamples,
} from "@dokploy/server/services/scaling/metrics-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REAL_TEST_TIMEOUT, waitFor } from "./real-swarm";

const execFileAsync = promisify(execFile);

// Needs an agent image built from this branch (Dockerfile.monitoring) on the
// local Docker. The agent runs as a plain container here, beside a Docker
// Compose project, the way it runs next to Compose deployments on a server.
const AGENT_IMAGE = process.env.DOKPLOY_MONITORING_TEST_IMAGE;
const suffix = Date.now().toString(36);
const AGENT = `compose-metrics-agent-${suffix}`;
const PROJECT = `compose-metrics-${suffix}`;
const PORT = 14_500;
const TOKEN = "compose-metrics-token";

const metricsConfig = {
	server: {
		type: "Dokploy",
		refreshRate: 60,
		port: 4500,
		token: TOKEN,
		urlCallback: "http://127.0.0.1/callback",
		retentionDays: 1,
		cronJob: "0 0 * * *",
		thresholds: { cpu: 0, memory: 0 },
	},
	containers: { refreshRate: 60, services: { include: [], exclude: [] } },
	tasks: { enabled: true, refreshRate: 5, retentionHours: 1 },
};

const compose = (...args: string[]) =>
	execFileAsync("docker", ["compose", "-p", PROJECT, ...args], {
		cwd: workdir,
	});

let workdir = "";

describe.runIf(AGENT_IMAGE)(
	"plain Docker Compose replica metrics (real Docker)",
	() => {
		beforeAll(async () => {
			workdir = mkdtempSync(join(tmpdir(), "compose-metrics-"));
			writeFileSync(
				join(workdir, "compose.yml"),
				[
					"services:",
					"  web:",
					"    image: traefik/whoami:v1.10.3",
					"    cpus: 0.5",
					"    mem_limit: 128m",
					"",
				].join("\n"),
			);
			await execFileAsync("docker", [
				"run",
				"-d",
				"--name",
				AGENT,
				"-p",
				`127.0.0.1:${PORT}:4500`,
				"-v",
				"/var/run/docker.sock:/var/run/docker.sock",
				"-e",
				`METRICS_CONFIG=${JSON.stringify(metricsConfig)}`,
				"-e",
				"MONITORING_DB_PATH=/tmp/monitoring.db",
				AGENT_IMAGE as string,
			]);
			await compose("up", "-d", "--scale", "web=2");
			// A one-off container of the same service must not count as a replica.
			await compose("run", "-d", "--no-deps", "web");
		}, REAL_TEST_TIMEOUT);

		afterAll(async () => {
			await compose("down", "--remove-orphans").catch(() => undefined);
			await execFileAsync("docker", ["rm", "-f", AGENT]).catch(() => undefined);
			if (workdir) rmSync(workdir, { recursive: true, force: true });
		});

		it(
			"samples every replica under the compose key, by container and number",
			async () => {
				const replicaIds = (await compose("ps", "-q", "web")).stdout
					.split("\n")
					.map((id) => id.trim())
					.filter(Boolean);
				const { stdout: fullIds } = await execFileAsync("docker", [
					"inspect",
					"--format",
					"{{.Id}}",
					...replicaIds,
				]);
				const replicas = fullIds.split("\n").filter(Boolean);
				expect(replicas).toHaveLength(2);

				const endpoint = {
					baseUrl: `http://127.0.0.1:${PORT}`,
					token: TOKEN,
					refreshRateSeconds: 5,
				};
				const query = {
					service: composeServiceKey(PROJECT, "web"),
					since: new Date(Date.now() - 10 * 60_000),
					limit: 1000,
				};
				const result = await waitFor(
					() =>
						fetchNodeSamples(endpoint, query).catch(() => ({
							samples: [],
							features: [] as string[],
						})),
					({ samples }) =>
						new Set(samples.map((sample) => sample.taskId)).size >= 2,
					90_000,
				);

				expect(result.features).toContain("compose");
				expect(new Set(result.samples.map((sample) => sample.taskId))).toEqual(
					new Set(replicas),
				);
				expect(
					[...new Set(result.samples.map((sample) => sample.slot))].sort(),
				).toEqual([1, 2]);
				for (const sample of result.samples) {
					expect(sample.service).toBe(`compose:${PROJECT}/web`);
					expect(sample.memoryBytes).toBeGreaterThan(0);
					expect(sample.memoryLimitBytes).toBe(128 * 1024 * 1024);
				}
			},
			REAL_TEST_TIMEOUT,
		);
	},
);
