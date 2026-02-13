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

const {
	inspectMock,
	getServiceMock,
	createServiceMock,
	getRemoteDockerMock,
	execAsyncMock,
	execAsyncRemoteMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<never>>();
	const getService = vi.fn(() => ({ inspect }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
	}));
	const execAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
	const execAsyncRemote = vi.fn(async () => ({ stdout: "", stderr: "" }));
	return {
		inspectMock: inspect,
		getServiceMock: getService,
		createServiceMock: createService,
		getRemoteDockerMock: getRemoteDocker,
		execAsyncMock: execAsync,
		execAsyncRemoteMock: execAsyncRemote,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
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
		stopGracePeriodSwarm: 0n,
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
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
		});
		execAsyncMock.mockClear();
		execAsyncRemoteMock.mockClear();
	});

	it("converts bigint stopGracePeriodSwarm to a number and keeps zero values", async () => {
		const application = createApplication({ stopGracePeriodSwarm: 0n });

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

	it("distributes registry auth to workers via execAsyncRemote when serverId exists and credentials are provided", async () => {
		const application = createApplication({
			serverId: "server-id",
			username: "testuser",
			password: "testpass",
			registryUrl: "https://index.docker.io/v1/",
		});

		await mechanizeDockerContainer(application);

		expect(execAsyncRemoteMock).toHaveBeenCalledTimes(1);
		expect(execAsyncRemoteMock).toHaveBeenCalledWith(
			"server-id",
			"docker service update --with-registry-auth test-app",
		);
		expect(execAsyncMock).not.toHaveBeenCalled();
	});

	it("distributes registry auth to workers via execAsync when serverId is null and credentials are provided", async () => {
		const application = createApplication({
			serverId: null,
			username: "testuser",
			password: "testpass",
			registryUrl: "https://index.docker.io/v1/",
		});

		await mechanizeDockerContainer(application);

		expect(execAsyncMock).toHaveBeenCalledTimes(1);
		expect(execAsyncMock).toHaveBeenCalledWith(
			"docker service update --with-registry-auth test-app",
		);
		expect(execAsyncRemoteMock).not.toHaveBeenCalled();
	});

	it("does not distribute registry auth when no credentials are provided", async () => {
		const application = createApplication({
			username: null,
			password: null,
		});

		await mechanizeDockerContainer(application);

		expect(execAsyncMock).not.toHaveBeenCalled();
		expect(execAsyncRemoteMock).not.toHaveBeenCalled();
	});
});
