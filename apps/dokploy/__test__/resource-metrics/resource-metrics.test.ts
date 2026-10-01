import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	DockerContainerLabels,
	DockerStatsRow,
	ResourceMetricDockerClient,
	ResourceMetricService,
	ResourceMetricSnapshot,
} from "@dokploy/server/services/resource-metrics";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let monitoringPath = "";

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();

	return {
		...actual,
		paths: () => ({
			...actual.paths(),
			MONITORING_PATH: monitoringPath,
		}),
	};
});

const {
	collectResourceMetricsForServices,
	readResourceMetricHistory,
	recordResourceMetricSnapshot,
	serviceOwnsContainer,
} = await import("@dokploy/server/services/resource-metrics");

const container = (
	overrides: Partial<DockerContainerLabels>,
): DockerContainerLabels => ({
	id: "container-id",
	name: "container-name",
	swarmServiceName: "",
	composeProject: "",
	stackNamespace: "",
	...overrides,
});

const service = (
	overrides: Partial<ResourceMetricService>,
): ResourceMetricService => ({
	serviceId: "service-id",
	type: "application",
	appName: "app-web",
	...overrides,
});

const snapshot = (
	time: string,
	overrides: Partial<ResourceMetricSnapshot> = {},
): ResourceMetricSnapshot => ({
	time,
	cpuPercent: 0,
	memoryBytes: 0,
	memoryLimitBytes: 0,
	blockReadBytes: 0,
	blockWriteBytes: 0,
	networkRxBytes: 0,
	networkTxBytes: 0,
	containers: 0,
	...overrides,
});

describe("resource metrics", () => {
	let consoleError: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		monitoringPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "dokploy-resource-metrics-"),
		);
		consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		consoleError.mockRestore();
		await fs.rm(monitoringPath, { recursive: true, force: true });
	});

	it("attributes containers by exact labels and safe task-name delimiters", () => {
		expect(
			serviceOwnsContainer(
				service({ type: "compose", appName: "web" }),
				container({ composeProject: "web-api", stackNamespace: "web-api" }),
			),
		).toBe(false);

		expect(
			serviceOwnsContainer(
				service({ type: "compose", appName: "web" }),
				container({ stackNamespace: "web" }),
			),
		).toBe(true);

		expect(
			serviceOwnsContainer(
				service({ type: "application", appName: "web" }),
				container({ name: "web-api.1.abcd", swarmServiceName: "web-api" }),
			),
		).toBe(false);

		expect(
			serviceOwnsContainer(
				service({ type: "application", appName: "web" }),
				container({ name: "web.1.abcd" }),
			),
		).toBe(true);

		expect(
			serviceOwnsContainer(
				service({ type: "application", appName: "web" }),
				container({ swarmServiceName: "web" }),
			),
		).toBe(true);
	});

	it("keeps one failed server from failing or zeroing every summary", async () => {
		const stale = snapshot("2026-01-01T00:00:00.000Z", {
			cpuPercent: 9,
			containers: 1,
		});
		await recordResourceMetricSnapshot("service", "remote-service", stale);

		const stats: DockerStatsRow[] = [
			{
				ID: "abc123",
				Name: "app-web.1.task",
				CPUPerc: "12.5%",
				MemUsage: "64MiB / 512MiB",
				BlockIO: "1MiB / 2MiB",
				NetIO: "3MiB / 4MiB",
			},
		];
		const dockerClient: ResourceMetricDockerClient = {
			getStats: vi.fn(async (serverId?: string) => {
				if (serverId === "server-1") {
					throw new Error("remote stats failed");
				}
				return stats;
			}),
			listContainers: vi.fn(async (serverId?: string | null) => {
				if (serverId === "server-1") {
					throw new Error("remote docker ps failed");
				}
				return [
					container({
						id: "abc123",
						name: "app-web.1.task",
						swarmServiceName: "app-web",
					}),
				];
			}),
		};

		const summaries = await collectResourceMetricsForServices(
			[
				service({ serviceId: "local-service", appName: "app-web" }),
				service({
					serviceId: "remote-service",
					appName: "remote-app",
					serverId: "server-1",
				}),
			],
			dockerClient,
		);

		expect(summaries["local-service"]?.current).toMatchObject({
			containers: 1,
			cpuPercent: 12.5,
			memoryBytes: 64 * 1024 * 1024,
			memoryLimitBytes: 512 * 1024 * 1024,
			blockReadBytes: 1024 * 1024,
			blockWriteBytes: 2 * 1024 * 1024,
			networkRxBytes: 3 * 1024 * 1024,
			networkTxBytes: 4 * 1024 * 1024,
		});
		expect(summaries["remote-service"]).toEqual({
			current: stale,
			history: [stale],
			unavailable: true,
		});
	});

	it("does not match a stats row with an empty ID to every container", async () => {
		const dockerClient: ResourceMetricDockerClient = {
			getStats: vi.fn(async () => [
				{
					ID: "",
					Name: "other-container",
					CPUPerc: "99%",
				},
			]),
			listContainers: vi.fn(async () => [
				container({
					id: "abc123",
					name: "app-web.1.task",
					swarmServiceName: "app-web",
				}),
			]),
		};

		const summaries = await collectResourceMetricsForServices(
			[service({ serviceId: "local-service", appName: "app-web" })],
			dockerClient,
		);

		expect(summaries["local-service"]?.current).toMatchObject({
			containers: 0,
			cpuPercent: 0,
		});
	});

	it("serializes concurrent history writes so samples are not lost", async () => {
		await Promise.all(
			Array.from({ length: 5 }, (_, index) =>
				recordResourceMetricSnapshot(
					"service",
					"history-service",
					snapshot(`2026-01-01T00:0${index}:00.000Z`, {
						cpuPercent: index,
						containers: index + 1,
					}),
				),
			),
		);

		const history = await readResourceMetricHistory(
			"service",
			"history-service",
		);
		expect(history.map((entry) => entry.cpuPercent)).toEqual([0, 1, 2, 3, 4]);
		expect(history.map((entry) => entry.containers)).toEqual([1, 2, 3, 4, 5]);
	});
});
