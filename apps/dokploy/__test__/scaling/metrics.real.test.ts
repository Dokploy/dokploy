import { docker } from "@dokploy/server/constants";
import { getApplicationMetrics } from "@dokploy/server/services/scaling/metrics-client";
import {
	buildMonitoringServiceSpec,
	deployMonitoringService,
} from "@dokploy/server/setup/monitoring-setup";
import { waitForSwarmServiceConvergence } from "@dokploy/server/utils/docker/utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REAL_TEST_TIMEOUT, waitFor } from "./real-swarm";

// Needs an agent image built from this branch (Dockerfile.monitoring) on every
// node, and DOKPLOY_MONITORING_URL pointing at the manager's agent port.
const AGENT_IMAGE = process.env.DOKPLOY_MONITORING_TEST_IMAGE;
const SERVICE_NAME = `metrics-real-${Date.now().toString(36)}`;

const metricsConfig = {
	server: {
		type: "Dokploy" as const,
		refreshRate: 30,
		port: 4500,
		token: "real-test-token",
		urlCallback: "http://127.0.0.1/callback",
		retentionDays: 1,
		cronJob: "0 0 * * *",
		thresholds: { cpu: 0, memory: 0 },
	},
	containers: { refreshRate: 60, services: { include: [], exclude: [] } },
	tasks: { enabled: true, refreshRate: 5, retentionHours: 1 },
};

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(async () => ({ metricsConfig })),
}));

const application = {
	applicationId: "metrics-real",
	appName: SERVICE_NAME,
	serverId: null,
	replicas: 4,
	modeSwarm: null,
	healthCheckSwarm: null,
	server: null,
	sourceType: "docker",
	registryId: null,
	buildRegistryId: null,
	cpuLimit: null,
	cpuReservation: "100000000",
	memoryLimit: null,
	memoryReservation: String(64 * 1024 * 1024),
	placementSwarm: null,
	endpointSpecSwarm: null,
	mounts: [],
	ports: [],
};

describe.runIf(AGENT_IMAGE)("replica metrics (real multi-node swarm)", () => {
	beforeAll(async () => {
		// The agent as earlier versions ran it: one replica on a manager, holding
		// the port that the global agents need.
		await docker.createService({
			Name: "dokploy-monitoring",
			TaskTemplate: {
				ContainerSpec: {
					Image: AGENT_IMAGE as string,
					Env: [`METRICS_CONFIG=${JSON.stringify(metricsConfig)}`],
				},
				Placement: { Constraints: ["node.role==manager"] },
			},
			Mode: { Replicated: { Replicas: 1 } },
			EndpointSpec: {
				Ports: [
					{
						TargetPort: 4500,
						PublishedPort: 4500,
						Protocol: "tcp",
						PublishMode: "host",
					},
				],
			},
		});
		await waitForSwarmServiceConvergence("dokploy-monitoring", null, {
			timeoutMs: 60_000,
		});

		await deployMonitoringService(
			docker,
			buildMonitoringServiceSpec({
				image: AGENT_IMAGE as string,
				metricsConfig,
				publishPort: metricsConfig.server.port,
			}),
		);
		await docker.createService({
			Name: SERVICE_NAME,
			TaskTemplate: {
				ContainerSpec: { Image: "traefik/whoami:v1.10.3" },
				Placement: { MaxReplicas: 2 },
			},
			Mode: { Replicated: { Replicas: 4 } },
		});
		await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
			timeoutMs: 120_000,
		});
	}, REAL_TEST_TIMEOUT);

	afterAll(async () => {
		for (const name of [SERVICE_NAME, "dokploy-monitoring"]) {
			await docker
				.getService(name)
				.remove()
				.catch(() => undefined);
		}
	});

	it(
		"replaces the replicated agent with one agent per node",
		async () => {
			const inspect = await docker.getService("dokploy-monitoring").inspect();
			expect(inspect.Spec.Mode).toEqual({ Global: {} });

			const running = await waitFor(
				async () =>
					(
						await docker.listTasks({
							filters: JSON.stringify({
								service: ["dokploy-monitoring"],
								"desired-state": ["running"],
							}),
						})
					).filter((task) => task.Status?.State === "running"),
				(tasks) => tasks.length === 2,
				60_000,
			);
			expect(new Set(running.map((task) => task.NodeID)).size).toBe(2);
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"reads every replica's CPU and memory from every node",
		async () => {
			const result = await waitFor(
				() => getApplicationMetrics(application, { rangeMinutes: 15 }),
				(current) => current.data?.summary.coverage.fresh === 4,
				120_000,
			);

			expect(result.agent).toEqual({ status: "ok", message: null });
			const data = result.data;
			expect(data?.summary.coverage).toEqual({ ready: 4, fresh: 4 });
			expect(data?.partial).toBe(false);
			expect(data?.nodes).toHaveLength(2);
			expect(data?.nodes.every((node) => node.reachable)).toBe(true);
			expect(data?.series.map((line) => line.slot)).toEqual([1, 2, 3, 4]);
			expect(new Set(data?.series.map((line) => line.nodeId)).size).toBe(2);
			for (const replica of data?.summary.replicas ?? []) {
				expect(replica.memoryBytes).toBeGreaterThan(0);
				expect(replica.cpuCores).toBeGreaterThanOrEqual(0);
				expect(replica.memoryPercent).not.toBeNull();
			}
		},
		REAL_TEST_TIMEOUT,
	);
});
