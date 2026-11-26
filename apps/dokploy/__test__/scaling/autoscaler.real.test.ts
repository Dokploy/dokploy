import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { docker } from "@dokploy/server/constants";
import type { AutoscalingPolicy } from "@dokploy/server/db/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runRealSwarmTests, waitFor } from "./real-swarm";

const execFileAsync = promisify(execFile);

// Needs a swarm on the local Docker and an agent image built from this branch
// (Dokploy's database is the usual test mock, so nothing is stored). The
// controller runs in-process; metrics, capacity and scaling are all real.
const AGENT_IMAGE = process.env.DOKPLOY_MONITORING_TEST_IMAGE;
const suffix = Date.now().toString(36);
const SERVICE = `autoscale-real-${suffix}`;
const AGENT = `autoscale-real-agent-${suffix}`;
const AGENT_PORT = 14_503;
const TOKEN = "autoscaler-real-token";
// A replica burns about one core for 75 seconds after it starts, then idles.
const BURN =
	'end=$(( $(date +%s) + 75 )); while [ "$(date +%s)" -lt "$end" ]; do i=0; while [ $i -lt 20000 ]; do i=$((i+1)); done; done; exec sleep 3600';

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

const application = {
	applicationId: "autoscale-real",
	appName: SERVICE,
	applicationStatus: "done",
	serverId: null,
	server: null,
	replicas: 1,
	modeSwarm: null,
	healthCheckSwarm: null,
	sourceType: "docker",
	registryId: null,
	buildRegistryId: null,
	cpuLimit: null,
	cpuReservation: "250000000",
	memoryLimit: null,
	memoryReservation: null,
	placementSwarm: null,
	endpointSpecSwarm: null,
	mounts: [],
	ports: [],
};

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(async () => ({ metricsConfig })),
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(async () => application),
}));

const replicasOf = async () =>
	(await docker.getService(SERVICE).inspect()).Spec?.Mode?.Replicated
		?.Replicas as number;

describe.runIf(AGENT_IMAGE && runRealSwarmTests)(
	"autoscaler (real Swarm and metrics agent)",
	() => {
		beforeAll(async () => {
			process.env.DOKPLOY_MONITORING_URL = `http://127.0.0.1:${AGENT_PORT}`;
			await execFileAsync("docker", [
				"run",
				"-d",
				"--name",
				AGENT,
				"-p",
				`127.0.0.1:${AGENT_PORT}:4500`,
				"-v",
				"/var/run/docker.sock:/var/run/docker.sock",
				"-e",
				`METRICS_CONFIG=${JSON.stringify(metricsConfig)}`,
				"-e",
				"MONITORING_DB_PATH=/tmp/monitoring.db",
				AGENT_IMAGE as string,
			]);
			await docker.createService({
				Name: SERVICE,
				TaskTemplate: {
					ContainerSpec: {
						Image: "busybox:latest",
						Command: ["sh", "-c", BURN],
					},
					Resources: { Reservations: { NanoCPUs: 250_000_000 } },
				},
				Mode: { Replicated: { Replicas: 1 } },
			});
			await waitFor(
				async () =>
					(
						await docker.listTasks({
							filters: JSON.stringify({
								service: [SERVICE],
								"desired-state": ["running"],
							}),
						})
					).filter((task) => task.Status?.State === "running").length,
				(running) => running === 1,
				60_000,
			);
		}, 120_000);

		afterAll(async () => {
			delete process.env.DOKPLOY_MONITORING_URL;
			await docker
				.getService(SERVICE)
				.remove()
				.catch(() => undefined);
			await execFileAsync("docker", ["rm", "-f", AGENT]).catch(() => undefined);
		});

		it("adds replicas while they burn CPU and removes them once they idle", async () => {
			const { evaluatePolicy } = await import(
				"@dokploy/server/services/scaling/autoscaler-controller"
			);
			let policy = {
				autoscalingPolicyId: "real",
				applicationId: application.applicationId,
				composeId: null,
				serviceName: null,
				enabled: true,
				minReplicas: 1,
				maxReplicas: 3,
				cpuTargetPercent: 50,
				memoryTargetPercent: null,
				tolerancePercent: 10,
				evaluationIntervalSeconds: 15,
				scaleUpWindowSeconds: 10,
				scaleDownWindowSeconds: 20,
				cooldownSeconds: 15,
				maxScaleUpStep: 4,
				maxScaleDownStep: 1,
				state: null,
				lastEvaluatedAt: null,
				lastScaledAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as AutoscalingPolicy;

			const seen: number[] = [];
			const log: string[] = [];
			const deadline = Date.now() + 330_000;
			while (Date.now() < deadline) {
				const out = await evaluatePolicy(policy, Date.now());
				log.push(
					`${new Date().toISOString()} ${out.decision.action}: ${out.decision.reason}`,
				);
				policy = {
					...policy,
					state: out.state,
					lastEvaluatedAt: new Date(),
					lastScaledAt: out.apply !== null ? new Date() : policy.lastScaledAt,
				};
				const replicas = await replicasOf();
				seen.push(replicas);
				if (seen.includes(3) && replicas === 1) break;
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}

			console.log(log.join("\n"));
			expect(Math.max(...seen)).toBe(3);
			expect(seen.at(-1)).toBe(1);
			// Down one step at a time: 3, then 2, then 1.
			const afterPeak = seen.slice(seen.indexOf(3));
			expect(afterPeak).toContain(2);
			expect(log.some((line) => line.includes("scale_up: CPU"))).toBe(true);
		}, 360_000);
	},
);
