import type { ContainerWithLabels, ServiceDescriptor } from "@dokploy/server";
import { getResourceUsage } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllContainersWithLabels, getAllContainerStats } = vi.hoisted(() => ({
	getAllContainersWithLabels:
		vi.fn<(serverId?: string) => Promise<ContainerWithLabels[]>>(),
	getAllContainerStats:
		vi.fn<(serverId?: string) => Promise<Record<string, string>[]>>(),
}));

vi.mock("@dokploy/server/services/docker", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server/services/docker")>()),
	getAllContainersWithLabels,
	getAllContainerStats,
}));

const baseService: Omit<ServiceDescriptor, "id" | "name" | "appName" | "type"> =
	{
		status: "done",
		projectId: "project-1",
		projectName: "Project",
		environmentId: "env-1",
		environmentName: "production",
	};

const container = (
	overrides: Partial<ContainerWithLabels>,
): ContainerWithLabels => ({
	containerId: "container-id",
	name: "container-name",
	image: "some-image:latest",
	state: "running",
	labels: {},
	sizeMb: 0,
	virtualSizeMb: 0,
	...overrides,
});

const stat = (overrides: Partial<Record<string, string>>) => ({
	CPUPerc: "0%",
	MemUsage: "0MB / 0MB",
	MemPerc: "0%",
	NetIO: "0MB / 0MB",
	BlockIO: "0MB / 0MB",
	Container: "",
	ID: "",
	Name: "",
	...overrides,
});

describe("getResourceUsage", () => {
	beforeEach(() => {
		getAllContainersWithLabels.mockReset();
		getAllContainerStats.mockReset();
	});

	it("matches an application by its swarm service name label", async () => {
		getAllContainersWithLabels.mockResolvedValue([
			container({
				name: "my-app.1.abc123",
				labels: { "com.docker.swarm.service.name": "my-app" },
				sizeMb: 12,
			}),
		]);
		getAllContainerStats.mockResolvedValue([
			stat({
				Name: "my-app.1.abc123",
				CPUPerc: "2.50%",
				MemUsage: "100MB / 512MB",
			}),
		]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "app-1",
			name: "My App",
			appName: "my-app",
			type: "application",
		};

		const [result] = await getResourceUsage([service]);

		expect(result?.containers).toHaveLength(1);
		expect(result?.cpuPercent).toBeCloseTo(2.5);
		expect(result?.memUsedMb).toBeCloseTo(100);
		expect(result?.memLimitMb).toBeCloseTo(512);
		expect(result?.diskUsedMb).toBe(12);
	});

	it("does not match a container belonging to a different service", async () => {
		getAllContainersWithLabels.mockResolvedValue([
			container({
				name: "other-app.1.xyz",
				labels: { "com.docker.swarm.service.name": "other-app" },
			}),
		]);
		getAllContainerStats.mockResolvedValue([]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "app-1",
			name: "My App",
			appName: "my-app",
			type: "application",
		};

		const [result] = await getResourceUsage([service]);

		expect(result?.containers).toHaveLength(0);
		expect(result?.cpuPercent).toBe(0);
	});

	it("sums CPU, memory, and storage across replicas of the same service", async () => {
		getAllContainersWithLabels.mockResolvedValue([
			container({
				name: "my-app.1.aaa",
				labels: { "com.docker.swarm.service.name": "my-app" },
				sizeMb: 10,
			}),
			container({
				name: "my-app.2.bbb",
				labels: { "com.docker.swarm.service.name": "my-app" },
				sizeMb: 5,
			}),
		]);
		getAllContainerStats.mockResolvedValue([
			stat({
				Name: "my-app.1.aaa",
				CPUPerc: "1.00%",
				MemUsage: "50MB / 512MB",
			}),
			stat({
				Name: "my-app.2.bbb",
				CPUPerc: "3.00%",
				MemUsage: "80MB / 512MB",
			}),
		]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "app-1",
			name: "My App",
			appName: "my-app",
			type: "application",
		};

		const [result] = await getResourceUsage([service]);

		expect(result?.containers).toHaveLength(2);
		expect(result?.cpuPercent).toBeCloseTo(4);
		expect(result?.memUsedMb).toBeCloseTo(130);
		expect(result?.diskUsedMb).toBe(15);
	});

	it("matches a plain docker-compose service by its compose project label", async () => {
		getAllContainersWithLabels.mockResolvedValue([
			container({
				name: "my-compose-web-1",
				labels: {
					"com.docker.compose.project": "my-compose",
					"com.docker.compose.service": "web",
				},
			}),
			container({
				name: "unrelated-container",
				labels: { "com.docker.swarm.service.name": "unrelated" },
			}),
		]);
		getAllContainerStats.mockResolvedValue([
			stat({ Name: "my-compose-web-1", CPUPerc: "1.00%" }),
		]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "compose-1",
			name: "My Compose",
			appName: "my-compose",
			type: "compose",
			composeType: "docker-compose",
		};

		const [result] = await getResourceUsage([service]);

		expect(result?.containers).toHaveLength(1);
		expect(result?.containers[0]?.containerName).toBe("my-compose-web-1");
	});

	it("matches a swarm-stack compose service by namespace and per-service prefix", async () => {
		getAllContainersWithLabels.mockResolvedValue([
			container({
				name: "my-stack_web.1.aaa",
				labels: {
					"com.docker.stack.namespace": "my-stack",
					"com.docker.swarm.service.name": "my-stack_web",
				},
			}),
			container({
				name: "my-stack_worker.1.bbb",
				labels: {
					"com.docker.stack.namespace": "my-stack",
					"com.docker.swarm.service.name": "my-stack_worker",
				},
			}),
		]);
		getAllContainerStats.mockResolvedValue([]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "compose-1",
			name: "My Stack",
			appName: "my-stack",
			type: "compose",
			composeType: "stack",
		};

		const [result] = await getResourceUsage([service]);

		expect(result?.containers).toHaveLength(2);
	});

	it("returns zeroed usage for a service with no running containers", async () => {
		getAllContainersWithLabels.mockResolvedValue([]);
		getAllContainerStats.mockResolvedValue([]);

		const service: ServiceDescriptor = {
			...baseService,
			id: "app-1",
			name: "Idle App",
			appName: "idle-app",
			type: "application",
		};

		const [result] = await getResourceUsage([service]);

		expect(result).toMatchObject({
			containers: [],
			cpuPercent: 0,
			memUsedMb: 0,
			memLimitMb: 0,
			diskUsedMb: 0,
		});
	});
});
