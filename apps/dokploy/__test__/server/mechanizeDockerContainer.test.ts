import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			StopGracePeriod?: number;
			Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
		};
	};
	[key: string]: unknown;
};

type MockServiceInspect = {
	Version: { Index: number };
	Spec: { TaskTemplate: { ForceUpdate?: number } };
	ServiceStatus?: { DesiredTasks: number };
};

const {
	inspectMock,
	updateMock,
	serviceMock,
	getServiceMock,
	createServiceMock,
	getRemoteDockerMock,
	waitForSwarmServiceUpdateMock,
	getSwarmServiceUpdateTimeoutMsMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<MockServiceInspect>>();
	const update = vi.fn(async () => undefined);
	const service = { id: "test-app", inspect, update };
	const getService = vi.fn(() => service);
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
	}));
	return {
		inspectMock: inspect,
		updateMock: update,
		serviceMock: service,
		getServiceMock: getService,
		createServiceMock: createService,
		getRemoteDockerMock: getRemoteDocker,
		waitForSwarmServiceUpdateMock: vi.fn(async () => undefined),
		getSwarmServiceUpdateTimeoutMsMock: vi.fn(() => 120_000),
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock("@dokploy/server/utils/docker/swarm-update", () => ({
	getSwarmServiceUpdateTimeoutMs: getSwarmServiceUpdateTimeoutMsMock,
	waitForSwarmServiceUpdate: waitForSwarmServiceUpdateMock,
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
		updateMock.mockReset();
		updateMock.mockResolvedValue(undefined);
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		waitForSwarmServiceUpdateMock.mockClear();
		getSwarmServiceUpdateTimeoutMsMock.mockClear();
		getSwarmServiceUpdateTimeoutMsMock.mockReturnValue(120_000);
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
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

	it("waits for an existing service update to finish", async () => {
		inspectMock.mockReset();
		inspectMock.mockResolvedValue({
			Version: { Index: 7 },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
			ServiceStatus: { DesiredTasks: 1 },
		});

		await mechanizeDockerContainer(createApplication());

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				version: 7,
				TaskTemplate: expect.objectContaining({ ForceUpdate: 3 }),
			}),
		);
		expect(getSwarmServiceUpdateTimeoutMsMock).toHaveBeenCalledWith(
			expect.objectContaining({ replicas: 1 }),
		);
		expect(waitForSwarmServiceUpdateMock).toHaveBeenCalledWith(
			expect.anything(),
			serviceMock,
			{
				expectedForceUpdate: 3,
				previousVersion: 7,
				timeoutMs: 120_000,
			},
		);
		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("does not create a replacement service when an update fails", async () => {
		inspectMock.mockReset();
		inspectMock.mockResolvedValue({
			Version: { Index: 7 },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});
		updateMock.mockRejectedValue(new Error("update failed"));

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			"update failed",
		);

		expect(createServiceMock).not.toHaveBeenCalled();
		expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
	});

	it("propagates a failed rollout without creating a replacement service", async () => {
		inspectMock.mockReset();
		inspectMock.mockResolvedValue({
			Version: { Index: 7 },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});
		waitForSwarmServiceUpdateMock.mockRejectedValue(
			new Error("Swarm service update rolled back"),
		);

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			"Swarm service update rolled back",
		);

		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("does not wait for job-mode service updates", async () => {
		inspectMock.mockReset();
		inspectMock.mockResolvedValue({
			Version: { Index: 7 },
			Spec: { TaskTemplate: { ForceUpdate: 2 } },
		});

		await mechanizeDockerContainer(
			createApplication({
				modeSwarm: { ReplicatedJob: { TotalCompletions: 1 } },
			}),
		);

		expect(updateMock).toHaveBeenCalledOnce();
		expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
	});
});
