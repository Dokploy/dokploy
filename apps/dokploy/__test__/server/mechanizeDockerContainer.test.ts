import { db } from "@dokploy/server/db";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			HealthCheck?: {
				Test?: string[];
			};
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
	listTasksMock,
	getRemoteDockerMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<never>>();
	const getService = vi.fn(() => ({ inspect }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const listTasks = vi.fn(async (): Promise<unknown[]> => []);
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
		listTasks,
	}));
	return {
		inspectMock: inspect,
		getServiceMock: getService,
		createServiceMock: createService,
		listTasksMock: listTasks,
		getRemoteDockerMock: getRemoteDocker,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const notFoundError = () =>
	Object.assign(new Error("(HTTP code 404) no such service"), {
		statusCode: 404,
	});

const outOfSequenceError = () =>
	Object.assign(
		new Error(
			"(HTTP code 500) server error - rpc error: code = Unknown desc = update out of sequence",
		),
		{ statusCode: 500 },
	);

const findReplicaSettingsMock = vi.mocked(db.query.applications.findFirst);

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	sleep: vi.fn(async () => undefined),
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
		applicationId: "app-1",
		replicas: 1,
		stopGracePeriodSwarm: 0,
		ulimitsSwarm: null,
		serverId: "server-id",
		...overrides,
	}) as unknown as ApplicationNested;

describe("mechanizeDockerContainer", () => {
	afterEach(() => {
		findReplicaSettingsMock.mockReset();
		findReplicaSettingsMock.mockResolvedValue(undefined);
	});

	beforeEach(() => {
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(notFoundError());
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		listTasksMock.mockReset();
		listTasksMock.mockResolvedValue([
			{ Spec: { ForceUpdate: 0 }, Status: { State: "running" } },
			{ Spec: { ForceUpdate: 3 }, Status: { State: "running" } },
		]);
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
			listTasks: listTasksMock,
		});
	});

	it("fails when Swarm can't schedule the new task", async () => {
		listTasksMock.mockResolvedValue([
			{ Status: { State: "running" } },
			{
				Status: {
					State: "pending",
					Err: "no suitable node (insufficient resources on 1 node)",
				},
			},
		]);

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			/insufficient resources/,
		);
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

	it("normalizes pasted health check JSON before creating a service", async () => {
		const application = createApplication({
			healthCheckSwarm: {
				Test: ['["CMD","wget","-q","http://localhost/"]'],
			},
		});

		await mechanizeDockerContainer(application);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		const call = createServiceMock.mock.calls[0];
		if (!call) {
			throw new Error("createServiceMock should have been called once");
		}
		const [settings] = call;
		expect(settings.TaskTemplate?.ContainerSpec?.HealthCheck?.Test).toEqual([
			"CMD",
			"wget",
			"-q",
			"http://localhost/",
		]);
	});

	describe("when the service already exists", () => {
		const updateMock = vi.fn<(opts: MockCreateServiceOptions) => Promise<void>>(
			async () => undefined,
		);

		const mockExistingService = (spec: Record<string, unknown>) => {
			updateMock.mockClear();
			inspectMock.mockResolvedValue({
				Version: { Index: 7 },
				Spec: { TaskTemplate: { ForceUpdate: 2 }, ...spec },
			} as never);
			getServiceMock.mockReturnValue({
				inspect: inspectMock,
				update: updateMock,
			} as never);
		};

		it("keeps service labels that were added outside Dokploy", async () => {
			const labels = {
				"traefik.enable": "true",
				"traefik.http.routers.app-web.rule": "Host(`app.example.com`)",
			};
			mockExistingService({ Labels: labels });

			await mechanizeDockerContainer(createApplication());

			expect(createServiceMock).not.toHaveBeenCalled();
			expect(updateMock).toHaveBeenCalledTimes(1);
			expect(updateMock.mock.calls[0]?.[0].Labels).toEqual(labels);
		});

		it("sends empty labels when the service has none", async () => {
			mockExistingService({});

			await mechanizeDockerContainer(createApplication());

			expect(updateMock).toHaveBeenCalledTimes(1);
			expect(updateMock.mock.calls[0]?.[0].Labels).toEqual({});
		});

		it("retries an out-of-sequence update instead of creating the service", async () => {
			mockExistingService({});
			updateMock.mockRejectedValueOnce(outOfSequenceError());

			await mechanizeDockerContainer(createApplication());

			expect(updateMock).toHaveBeenCalledTimes(2);
			expect(createServiceMock).not.toHaveBeenCalled();
		});

		it("surfaces other update errors without creating the service", async () => {
			mockExistingService({});
			updateMock.mockRejectedValueOnce(new Error("invalid mount config"));

			await expect(
				mechanizeDockerContainer(createApplication()),
			).rejects.toThrow("invalid mount config");
			expect(createServiceMock).not.toHaveBeenCalled();
		});

		it("re-reads the replica count on every update attempt", async () => {
			mockExistingService({});
			findReplicaSettingsMock
				.mockResolvedValueOnce({ replicas: 3, modeSwarm: null } as never)
				.mockResolvedValueOnce({ replicas: 3, modeSwarm: null } as never)
				.mockResolvedValueOnce({ replicas: 5, modeSwarm: null } as never);
			updateMock.mockRejectedValueOnce(outOfSequenceError());

			await mechanizeDockerContainer(createApplication({ replicas: 1 }));

			expect(updateMock).toHaveBeenCalledTimes(2);
			expect(updateMock.mock.calls[0]?.[0].Mode).toEqual({
				Replicated: { Replicas: 3 },
			});
			expect(updateMock.mock.calls[1]?.[0].Mode).toEqual({
				Replicated: { Replicas: 5 },
			});
		});

		const oldTask = { Spec: { ForceUpdate: 2 }, Status: { State: "running" } };

		it("waits for the new task and fails when Swarm can't place it", async () => {
			mockExistingService({});
			listTasksMock.mockResolvedValueOnce([oldTask]).mockResolvedValue([
				oldTask,
				{
					Spec: { ForceUpdate: 3 },
					Status: {
						State: "pending",
						Err: "no suitable node (insufficient resources on 1 node)",
					},
				},
			]);

			await expect(
				mechanizeDockerContainer(createApplication()),
			).rejects.toThrow(/insufficient resources/);
			expect(listTasksMock).toHaveBeenCalledTimes(2);
		});

		it("stops checking as soon as the new task is placed on a node", async () => {
			mockExistingService({});
			listTasksMock.mockResolvedValue([
				oldTask,
				{ Spec: { ForceUpdate: 3 }, Status: { State: "assigned" } },
			]);

			await mechanizeDockerContainer(createApplication());

			expect(listTasksMock).toHaveBeenCalledTimes(1);
		});
	});

	it("rethrows inspect errors other than not-found without creating", async () => {
		inspectMock.mockRejectedValue(new Error("ssh: connection reset"));

		await expect(mechanizeDockerContainer(createApplication())).rejects.toThrow(
			"ssh: connection reset",
		);
		expect(createServiceMock).not.toHaveBeenCalled();
	});

	it("creates the service with the replica count stored now, not the job's copy", async () => {
		findReplicaSettingsMock.mockResolvedValue({
			replicas: 4,
			modeSwarm: null,
		} as never);

		await mechanizeDockerContainer(createApplication({ replicas: 1 }));

		expect(createServiceMock.mock.calls[0]?.[0].Mode).toEqual({
			Replicated: { Replicas: 4 },
		});
	});

	it("keeps an explicit global mode", async () => {
		findReplicaSettingsMock.mockResolvedValue({
			replicas: 4,
			modeSwarm: { Global: {} },
		} as never);

		await mechanizeDockerContainer(createApplication());

		expect(createServiceMock.mock.calls[0]?.[0].Mode).toEqual({ Global: {} });
	});

	describe("endpoint mode", () => {
		const port = (publishMode: "host" | "ingress") => ({
			publishMode,
			protocol: "tcp",
			targetPort: 80,
			publishedPort: 8080,
		});
		const endpointSpec = () =>
			createServiceMock.mock.calls[0]?.[0].EndpointSpec as
				| { Mode?: string }
				| undefined;

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("leaves Swarm's default VIP when the setting is not on", async () => {
			await mechanizeDockerContainer(createApplication());

			expect(endpointSpec()).not.toHaveProperty("Mode");
		});

		it("uses DNS round robin with DOKPLOY_SWARM_ENDPOINT_MODE=dnsrr", async () => {
			vi.stubEnv("DOKPLOY_SWARM_ENDPOINT_MODE", "dnsrr");

			await mechanizeDockerContainer(
				createApplication({ ports: [port("host")] as never }),
			);

			expect(endpointSpec()?.Mode).toBe("dnsrr");
		});

		it("keeps the VIP for an app that publishes a port through the ingress", async () => {
			vi.stubEnv("DOKPLOY_SWARM_ENDPOINT_MODE", "dnsrr");

			await mechanizeDockerContainer(
				createApplication({ ports: [port("ingress")] as never }),
			);

			expect(endpointSpec()).not.toHaveProperty("Mode");
		});

		it("keeps a mode set in the app's Swarm settings", async () => {
			vi.stubEnv("DOKPLOY_SWARM_ENDPOINT_MODE", "dnsrr");

			await mechanizeDockerContainer(
				createApplication({ endpointSpecSwarm: { Mode: "vip" } } as never),
			);

			expect(endpointSpec()?.Mode).toBe("vip");
		});
	});
});
