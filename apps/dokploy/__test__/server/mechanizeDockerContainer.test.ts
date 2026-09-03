import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			StopGracePeriod?: number;
			Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
			Mounts?: Array<{
				Target: string;
				Source?: string;
				Type: string;
				TmpfsOptions?: { SizeBytes: number; Mode: number };
			}>;
		};
	};
	[key: string]: unknown;
};

const { inspectMock, getServiceMock, createServiceMock, getRemoteDockerMock } =
	vi.hoisted(() => {
		const inspect = vi.fn<() => Promise<never>>();
		const getService = vi.fn(() => ({ inspect }));
		const createService = vi.fn<
			(opts: MockCreateServiceOptions) => Promise<void>
		>(async () => undefined);
		const getRemoteDocker = vi.fn(async () => ({
			getService,
			createService,
		}));
		return {
			inspectMock: inspect,
			getServiceMock: getService,
			createServiceMock: createService,
			getRemoteDockerMock: getRemoteDocker,
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
		shmSize: null,
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

	it("adds a tmpfs mount at /dev/shm when shmSize is set", async () => {
		const application = createApplication({ shmSize: "6442450944" });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		const shmMount = settings.TaskTemplate?.ContainerSpec?.Mounts?.find(
			(m) => m.Target === "/dev/shm",
		);
		expect(shmMount).toBeDefined();
		expect(shmMount?.Type).toBe("tmpfs");
		expect(shmMount?.TmpfsOptions?.SizeBytes).toBe(6442450944);
		expect(shmMount?.TmpfsOptions?.Mode).toBe(0o1777);
	});

	it("does not add a /dev/shm mount when shmSize is null", async () => {
		const application = createApplication({ shmSize: null });

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		const shmMount = settings.TaskTemplate?.ContainerSpec?.Mounts?.find(
			(m) => m.Target === "/dev/shm",
		);
		expect(shmMount).toBeUndefined();
	});

	it("keeps a user-configured /dev/shm mount instead of adding a duplicate", async () => {
		const application = createApplication({
			shmSize: "6442450944",
			mounts: [
				{
					mountId: "mount-id",
					type: "volume",
					hostPath: null,
					volumeName: "shared-memory",
					filePath: null,
					content: null,
					mountPath: "/dev/shm",
					serviceType: "application",
					applicationId: "application-id",
					composeId: null,
					libsqlId: null,
					mariadbId: null,
					mongoId: null,
					mysqlId: null,
					postgresId: null,
					redisId: null,
				},
			],
		});

		await mechanizeDockerContainer(application);

		const [settings] = createServiceMock.mock.calls[0] ?? [];
		const shmMounts = settings?.TaskTemplate?.ContainerSpec?.Mounts?.filter(
			(m) => m.Target === "/dev/shm",
		);
		expect(shmMounts).toHaveLength(1);
		expect(shmMounts?.[0]).toMatchObject({
			Type: "volume",
			Source: "shared-memory",
		});
	});

	it.each(["invalid", "0", "-1", "1.5", "12bytes"])(
		"rejects invalid shmSize %s before calling Docker",
		async (shmSize) => {
			await expect(
				mechanizeDockerContainer(createApplication({ shmSize })),
			).rejects.toThrow("SHM size must be a positive safe integer in bytes");
			expect(createServiceMock).not.toHaveBeenCalled();
		},
	);
});
