import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			StopGracePeriod?: number;
			Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
		};
		Placement?: { Constraints?: string[] };
	};
	[key: string]: unknown;
};

const {
	inspectMock,
	getServiceMock,
	createServiceMock,
	getRemoteDockerMock,
	infoMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<never>>();
	const getService = vi.fn(() => ({ inspect }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const info = vi.fn(async () => ({ Swarm: { NodeID: "node-123" } }));
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
		info,
	}));
	return {
		inspectMock: inspect,
		getServiceMock: getService,
		createServiceMock: createService,
		getRemoteDockerMock: getRemoteDocker,
		infoMock: info,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "dockerfile",
		env: null,
		mounts: [],
		cpuLimit: null,
		memoryLimit: null,
		memoryReservation: null,
		cpuReservation: null,
		command: null,
		ports: [],
		sourceType: "docker",
		dockerImage: "example:latest",
		registry: null,
		environment: {
			project: { env: null },
			env: null,
		},
		replicas: 1,
		stopGracePeriodSwarm: 0,
		ulimitsSwarm: null,
		serverId: "server-id",
		...overrides,
	}) as unknown as ApplicationNested;

describe("mechanizeDockerContainer", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(new Error("service not found"));
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		infoMock.mockClear();
		infoMock.mockResolvedValue({ Swarm: { NodeID: "node-123" } });
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
			info: infoMock,
		});
	});

	it("passes stopGracePeriodSwarm as a number and keeps zero values", async () => {
		const application = createApplication({ stopGracePeriodSwarm: 0 });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0] as
			| [MockCreateServiceOptions]
			| undefined;
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec?.StopGracePeriod).toBe(0);
		expect(typeof settings.TaskTemplate?.ContainerSpec?.StopGracePeriod).toBe(
			"number",
		);
	});

	it("omits StopGracePeriod when stopGracePeriodSwarm is null", async () => {
		const application = createApplication({ stopGracePeriodSwarm: null });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0] as
			| [MockCreateServiceOptions]
			| undefined;
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty(
			"StopGracePeriod",
		);
	});

	it("passes ulimits to ContainerSpec when ulimitsSwarm is defined", async () => {
		const ulimits = [
			{ Name: "nofile", Soft: 10000, Hard: 20000 },
			{ Name: "nproc", Soft: 4096, Hard: 8192 },
		];
		const application = createApplication({ ulimitsSwarm: ulimits });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec?.Ulimits).toEqual(ulimits);
	});

	it("omits Ulimits when ulimitsSwarm is null", async () => {
		const application = createApplication({ ulimitsSwarm: null });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty("Ulimits");
	});

	it("omits Ulimits when ulimitsSwarm is an empty array", async () => {
		const application = createApplication({ ulimitsSwarm: [] });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec).not.toHaveProperty("Ulimits");
	});

	it("pins a locally built image to the build node", async () => {
		const application = createApplication({
			sourceType: "github",
			registry: null,
			placementSwarm: null,
		});

		await mechanizeDockerContainer(application);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints).toContain(
			"node.id==node-123",
		);
	});

	it("does not pin external (docker) images to the build node", async () => {
		const application = createApplication({ sourceType: "docker" });

		await mechanizeDockerContainer(application);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints ?? []).not.toContain(
			"node.id==node-123",
		);
	});

	it("does not pin images that are pushed to a registry", async () => {
		const application = createApplication({
			sourceType: "github",
			registry: null,
			rollbackRegistry: {} as ApplicationNested["rollbackRegistry"],
		});

		await mechanizeDockerContainer(application);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints ?? []).not.toContain(
			"node.id==node-123",
		);
	});

	it("respects a user-defined placement instead of auto-pinning", async () => {
		const application = createApplication({
			sourceType: "github",
			registry: null,
			placementSwarm: { Constraints: ["node.labels.zone==eu"] },
		});

		await mechanizeDockerContainer(application);

		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.Placement?.Constraints).toEqual([
			"node.labels.zone==eu",
		]);
	});
});
