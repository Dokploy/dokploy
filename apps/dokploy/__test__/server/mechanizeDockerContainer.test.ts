import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	waitForSwarmServiceUpdateMock,
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
		waitForSwarmServiceUpdateMock: vi.fn(async () => undefined),
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock("@dokploy/server/utils/docker/swarm-update", () => ({
	getSwarmServiceUpdateTimeoutMs: vi.fn(() => 120_000),
	waitForSwarmServiceUpdate: waitForSwarmServiceUpdateMock,
}));

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
		waitForSwarmServiceUpdateMock.mockReset();
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
			expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
		});

		it("stops checking as soon as the new task is placed on a node", async () => {
			mockExistingService({});
			listTasksMock.mockResolvedValue([
				oldTask,
				{ Spec: { ForceUpdate: 3 }, Status: { State: "assigned" } },
			]);

			await mechanizeDockerContainer(createApplication());

			expect(listTasksMock).toHaveBeenCalledTimes(2);
		});

		it("waits for the rollout to finish", async () => {
			mockExistingService({});

			await mechanizeDockerContainer(createApplication());

			expect(updateMock).toHaveBeenCalledWith(
				expect.objectContaining({
					version: 7,
					TaskTemplate: expect.objectContaining({ ForceUpdate: 3 }),
				}),
			);
			expect(waitForSwarmServiceUpdateMock).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				{ expectedForceUpdate: 3, previousVersion: 7, timeoutMs: 120_000 },
			);
			expect(createServiceMock).not.toHaveBeenCalled();
		});

		it("fails the deploy when the rollout is rolled back", async () => {
			mockExistingService({});
			waitForSwarmServiceUpdateMock.mockRejectedValue(
				new Error("Swarm service update rolled back"),
			);

			await expect(
				mechanizeDockerContainer(createApplication()),
			).rejects.toThrow("Swarm service update rolled back");
			expect(createServiceMock).not.toHaveBeenCalled();
		});

		it("does not create a replacement service when the update fails", async () => {
			mockExistingService({});
			updateMock.mockRejectedValueOnce(new Error("update failed"));

			await expect(
				mechanizeDockerContainer(createApplication()),
			).rejects.toThrow("update failed");
			expect(createServiceMock).not.toHaveBeenCalled();
			expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
		});

		it("does not wait when no task was running before the update", async () => {
			mockExistingService({});
			listTasksMock.mockResolvedValueOnce([]);

			await mechanizeDockerContainer(createApplication());

			expect(updateMock).toHaveBeenCalledTimes(1);
			expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
		});

		it("still waits when the running tasks cannot be listed", async () => {
			mockExistingService({});
			listTasksMock.mockRejectedValueOnce(new Error("listing failed"));

			await mechanizeDockerContainer(createApplication());

			expect(waitForSwarmServiceUpdateMock).toHaveBeenCalledTimes(1);
		});

		it("does not wait for job services", async () => {
			mockExistingService({});

			await mechanizeDockerContainer(
				createApplication({
					modeSwarm: { ReplicatedJob: { TotalCompletions: 1 } },
				}),
			);

			expect(updateMock).toHaveBeenCalledTimes(1);
			expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
		});
	});

	it("does not wait for the rollout on a first deploy", async () => {
		await mechanizeDockerContainer(createApplication());

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		expect(waitForSwarmServiceUpdateMock).not.toHaveBeenCalled();
	});
});
