import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	pullImage: vi.fn(async () => undefined),
	pullRemoteImage: vi.fn(async () => undefined),
	getRemoteDocker: vi.fn(),
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	pullImage: mocks.pullImage,
	pullRemoteImage: mocks.pullRemoteImage,
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));
vi.mock("@dokploy/server/services/settings", () => ({
	getDokployImageTag: vi.fn(() => "latest"),
}));

const {
	buildMonitoringServiceSpec,
	deployMonitoringService,
	getMonitoringImage,
	setupWebMonitoring,
} = await import("@dokploy/server/setup/monitoring-setup");

const metricsConfig = {
	server: { port: 4500, token: "t" },
} as unknown as Parameters<
	typeof buildMonitoringServiceSpec
>[0]["metricsConfig"];

type TaskTemplate = {
	ContainerSpec?: {
		Env?: string[];
		Mounts?: { Type?: string; Source?: string; Target?: string }[];
	};
	Networks?: unknown;
};
const taskTemplate = (spec: { TaskTemplate?: unknown }) =>
	spec.TaskTemplate as TaskTemplate;

const notFound = () =>
	Object.assign(new Error("no such service"), { statusCode: 404 });

const fakeDocker = (inspect: () => Promise<unknown>) => {
	const service = {
		inspect: vi.fn(inspect),
		update: vi.fn(async () => undefined),
		remove: vi.fn(async () => undefined),
	};
	const docker = {
		getContainer: () => ({
			remove: async () => {
				throw notFound();
			},
		}),
		getService: () => service,
		createService: vi.fn(async () => undefined),
		getImage: vi.fn(() => ({ inspect: vi.fn(async () => ({})) })),
	};
	return { docker, service };
};

describe("buildMonitoringServiceSpec", () => {
	it("runs one agent per node with its data in a named volume", () => {
		const spec = buildMonitoringServiceSpec({
			image: "registry/agent:1",
			metricsConfig,
		});

		expect(spec.Mode).toEqual({ Global: {} });
		expect(spec.TaskTemplate).not.toHaveProperty("Placement");
		expect(spec.TaskTemplate?.Networks).toEqual([{ Target: "host" }]);
		expect(taskTemplate(spec).ContainerSpec?.Env).toContain(
			"MONITORING_DB_PATH=/app/data/monitoring.db",
		);
		expect(taskTemplate(spec).ContainerSpec?.Mounts).toContainEqual({
			Type: "volume",
			Source: "dokploy-monitoring-data",
			Target: "/app/data",
		});
		expect(
			taskTemplate(spec).ContainerSpec?.Mounts?.some(
				(mount) => mount.Target === "/app/monitoring.db",
			),
		).toBe(false);
	});

	it("publishes the port on each node instead of using the host network", () => {
		const spec = buildMonitoringServiceSpec({
			image: "registry/agent:1",
			metricsConfig,
			publishPort: 4500,
		});

		expect(spec.TaskTemplate).not.toHaveProperty("Networks");
		expect(spec.EndpointSpec?.Ports).toEqual([
			{
				TargetPort: 4500,
				PublishedPort: 4500,
				Protocol: "tcp",
				PublishMode: "host",
			},
		]);
	});
});

describe("deployMonitoringService", () => {
	const spec = buildMonitoringServiceSpec({ image: "agent", metricsConfig });

	it("replaces the replicated agent from earlier versions", async () => {
		const { docker, service } = fakeDocker(async () => ({
			Version: { Index: 3 },
			Spec: { Mode: { Replicated: { Replicas: 1 } }, TaskTemplate: {} },
		}));

		await deployMonitoringService(docker as never, spec);

		expect(service.remove).toHaveBeenCalled();
		expect(service.update).not.toHaveBeenCalled();
		expect(docker.createService).toHaveBeenCalledWith(spec);
	});

	it("updates an agent that is already global", async () => {
		const { docker, service } = fakeDocker(async () => ({
			Version: { Index: 3 },
			Spec: { Mode: { Global: {} }, TaskTemplate: { ForceUpdate: 2 } },
		}));

		await deployMonitoringService(docker as never, spec);

		expect(service.remove).not.toHaveBeenCalled();
		expect(service.update).toHaveBeenCalledWith(
			expect.objectContaining({
				version: 3,
				TaskTemplate: expect.objectContaining({ ForceUpdate: 3 }),
			}),
		);
		expect(docker.createService).not.toHaveBeenCalled();
	});

	it("creates the agent when there is none and surfaces other errors", async () => {
		const missing = fakeDocker(async () => {
			throw notFound();
		});
		await deployMonitoringService(missing.docker as never, spec);
		expect(missing.docker.createService).toHaveBeenCalled();

		const broken = fakeDocker(async () => {
			throw new Error("ssh: handshake failed");
		});
		await expect(
			deployMonitoringService(broken.docker as never, spec),
		).rejects.toThrow("handshake failed");
		expect(broken.docker.createService).not.toHaveBeenCalled();
	});
});

describe("getMonitoringImage", () => {
	afterEach(() => {
		delete process.env.DOKPLOY_MONITORING_IMAGE;
	});

	it("uses the published monitoring image by default", () => {
		expect(getMonitoringImage()).toBe("dokploy/monitoring:latest");
	});

	it("can be overridden", () => {
		process.env.DOKPLOY_MONITORING_IMAGE = "registry.local/agent:dev";
		expect(getMonitoringImage()).toBe("registry.local/agent:dev");
	});
});

describe("setupWebMonitoring", () => {
	beforeEach(() => {
		mocks.pullImage.mockReset();
		mocks.getWebServerSettings.mockResolvedValue({ metricsConfig });
	});

	it("uses a local image when the pull fails", async () => {
		const { docker } = fakeDocker(async () => {
			throw notFound();
		});
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.pullImage.mockRejectedValue(new Error("denied"));
		vi.spyOn(console, "warn").mockImplementation(() => undefined);

		await setupWebMonitoring();

		expect(docker.createService).toHaveBeenCalled();
	});

	it("fails when the image can neither be pulled nor found", async () => {
		const { docker } = fakeDocker(async () => {
			throw notFound();
		});
		docker.getImage.mockReturnValue({
			inspect: vi.fn(async () => {
				throw notFound();
			}),
		});
		mocks.getRemoteDocker.mockResolvedValue(docker);
		mocks.pullImage.mockRejectedValue(new Error("denied"));

		await expect(setupWebMonitoring()).rejects.toThrow("denied");
		expect(docker.createService).not.toHaveBeenCalled();
	});
});
