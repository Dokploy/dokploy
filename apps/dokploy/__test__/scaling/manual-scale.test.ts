import { db } from "@dokploy/server/db";
import type { CapacityApplication } from "@dokploy/server/services/scaling/capacity-service";
import { setApplicationReplicas } from "@dokploy/server/services/scaling/manual-scale";
import { ensureApplicationTransport } from "@dokploy/server/utils/traefik/vip-transport";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRemoteDockerMock } = vi.hoisted(() => ({
	getRemoteDockerMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock("@dokploy/server/utils/traefik/vip-transport", () => ({
	ensureApplicationTransport: vi.fn(async () => false),
}));

const notFound = () =>
	Object.assign(new Error("no such service"), { statusCode: 404 });

let liveService: {
	ID: string;
	Version: { Index: number };
	Spec: {
		Mode: Record<string, unknown>;
		TaskTemplate?: Record<string, unknown>;
	};
	UpdateStatus?: { State: string };
} | null;

const CPU = 1_000_000_000;
const node = {
	ID: "node-1",
	Description: {
		Hostname: "app-1",
		Resources: { NanoCPUs: 2 * CPU, MemoryBytes: 8 * 1024 ** 3 },
	},
	Spec: { Role: "manager", Availability: "active" },
	Status: { State: "ready" },
};
const listNodesMock = vi.fn();
const listTasksMock = vi.fn();

const inspectMock = vi.fn(async () => {
	if (!liveService) throw notFound();
	return structuredClone(liveService);
});
const updateMock = vi.fn(
	async ({ _body }: { _body: { Mode: Record<string, unknown> } }) => {
		if (liveService) {
			liveService.Spec.Mode = _body.Mode;
			liveService.Version.Index += 1;
		}
	},
);

const setMock = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
const insertedEvents: Record<string, unknown>[] = [];

const application = (
	overrides: Partial<CapacityApplication> = {},
): CapacityApplication => ({
	applicationId: "app-1",
	appName: "web-app",
	serverId: null,
	replicas: 2,
	modeSwarm: null,
	healthCheckSwarm: null,
	server: null,
	sourceType: "docker",
	registryId: null,
	buildRegistryId: null,
	cpuLimit: null,
	cpuReservation: null,
	memoryLimit: null,
	memoryReservation: null,
	placementSwarm: null,
	endpointSpecSwarm: null,
	mounts: [],
	ports: [],
	...overrides,
});

const replicatedService = (replicas: number, cpuReservation = 0) => ({
	ID: "svc-1",
	Version: { Index: 10 },
	Spec: {
		Mode: { Replicated: { Replicas: replicas } },
		TaskTemplate: {
			Resources: { Reservations: { NanoCPUs: cpuReservation } },
		},
	},
});

describe("setApplicationReplicas", () => {
	beforeEach(() => {
		liveService = replicatedService(2);
		inspectMock.mockClear();
		updateMock.mockClear();
		setMock.mockClear();
		insertedEvents.length = 0;
		getRemoteDockerMock.mockReset();
		listNodesMock.mockReset();
		listNodesMock.mockResolvedValue([node]);
		listTasksMock.mockReset();
		listTasksMock.mockResolvedValue([]);
		getRemoteDockerMock.mockResolvedValue({
			getService: () => ({ inspect: inspectMock, update: updateMock }),
			listNodes: listNodesMock,
			listTasks: listTasksMock,
		});
		vi.mocked(db.update).mockReturnValue({ set: setMock } as never);
		vi.mocked(db.insert).mockReturnValue({
			values: (event: Record<string, unknown>) => {
				insertedEvents.push(event);
				return { returning: async () => [event] };
			},
		} as never);
	});

	it("saves the count, scales the live service and records the change", async () => {
		const result = await setApplicationReplicas({
			application: application(),
			replicas: 4,
			userId: "user-1",
		});

		expect(result).toEqual({ from: 2, to: 4, applied: true, note: null });
		expect(setMock).toHaveBeenCalledWith({ replicas: 4, modeSwarm: null });
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(ensureApplicationTransport).toHaveBeenCalledWith("web-app", null);
		expect(insertedEvents).toEqual([
			expect.objectContaining({
				applicationId: "app-1",
				source: "manual",
				action: "scale_up",
				fromReplicas: 2,
				toReplicas: 4,
				userId: "user-1",
			}),
		]);
	});

	it("records a scale down", async () => {
		liveService = replicatedService(5);
		vi.mocked(ensureApplicationTransport).mockClear();

		await setApplicationReplicas({
			application: application({ replicas: 5 }),
			replicas: 1,
			userId: "user-1",
		});

		// One replica needs no balancing; a later scale-up or deploy adds it.
		expect(ensureApplicationTransport).not.toHaveBeenCalled();

		expect(insertedEvents[0]).toMatchObject({
			action: "scale_down",
			fromReplicas: 5,
			toReplicas: 1,
		});
	});

	it("refuses a manual change while autoscaling is on, but lets the autoscaler through", async () => {
		vi.mocked(db.query.autoscalingPolicies.findFirst).mockResolvedValueOnce({
			enabled: true,
			minReplicas: 2,
			maxReplicas: 5,
		} as never);

		await expect(
			setApplicationReplicas({
				application: application(),
				replicas: 4,
				userId: "user-1",
			}),
		).rejects.toMatchObject({ reason: "autoscaling_enabled" });
		expect(updateMock).not.toHaveBeenCalled();

		await setApplicationReplicas({
			application: application(),
			replicas: 4,
			userId: null,
			trigger: { source: "autoscaler", reason: "CPU 90% (target 50%)" },
		});
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(insertedEvents.at(-1)).toMatchObject({
			source: "autoscaler",
			action: "scale_up",
			reason: "CPU 90% (target 50%)",
			userId: null,
		});
	});

	it("folds an explicit replicated mode into the replicas column", async () => {
		await setApplicationReplicas({
			application: application({
				replicas: 1,
				modeSwarm: { Replicated: { Replicas: 2 } },
			}),
			replicas: 3,
			userId: "user-1",
		});

		expect(setMock).toHaveBeenCalledWith({ replicas: 3, modeSwarm: null });
	});

	it("only saves when the service has not been deployed", async () => {
		liveService = null;

		const result = await setApplicationReplicas({
			application: application(),
			replicas: 3,
			userId: "user-1",
		});

		expect(result.applied).toBe(false);
		expect(result.note).toMatch(/next deploy/);
		expect(setMock).toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
		expect(insertedEvents[0]).toMatchObject({ action: "set" });
	});

	it("does not start a stopped service", async () => {
		liveService = replicatedService(0);

		const result = await setApplicationReplicas({
			application: application(),
			replicas: 3,
			userId: "user-1",
		});

		expect(result).toMatchObject({ from: 0, applied: false });
		expect(result.note).toMatch(/stopped/);
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("refuses during a rollout without saving anything", async () => {
		liveService = {
			...replicatedService(2),
			UpdateStatus: { State: "updating" },
		};

		await expect(
			setApplicationReplicas({
				application: application(),
				replicas: 3,
				userId: "user-1",
			}),
		).rejects.toMatchObject({ reason: "rollout_in_progress" });
		expect(setMock).not.toHaveBeenCalled();
		expect(insertedEvents).toEqual([]);
	});

	it("refuses global mode without touching Docker", async () => {
		await expect(
			setApplicationReplicas({
				application: application({ modeSwarm: { Global: {} } }),
				replicas: 3,
				userId: "user-1",
			}),
		).rejects.toMatchObject({ reason: "unsupported_mode" });
		expect(getRemoteDockerMock).not.toHaveBeenCalled();
	});

	it("refuses a remote server without an SSH key instead of using the local daemon", async () => {
		await expect(
			setApplicationReplicas({
				application: application({
					serverId: "server-1",
					server: { sshKeyId: null },
				}),
				replicas: 3,
				userId: "user-1",
			}),
		).rejects.toThrow("no SSH key");
		expect(getRemoteDockerMock).not.toHaveBeenCalled();
	});

	it("records an error event when applying fails", async () => {
		updateMock.mockRejectedValueOnce(new Error("node unreachable"));

		await expect(
			setApplicationReplicas({
				application: application(),
				replicas: 3,
				userId: "user-1",
			}),
		).rejects.toThrow("node unreachable");
		expect(insertedEvents).toEqual([
			expect.objectContaining({
				action: "error",
				reason: "node unreachable",
				fromReplicas: 2,
				toReplicas: 3,
			}),
		]);
	});

	it("refuses a scale-up that does not fit unless the warning is acknowledged", async () => {
		liveService = replicatedService(2, CPU);

		await expect(
			setApplicationReplicas({
				application: application(),
				replicas: 4,
				userId: "user-1",
			}),
		).rejects.toMatchObject({
			reason: "insufficient_capacity",
			message: expect.stringContaining("Only 2 of 4 replicas fit"),
		});
		expect(setMock).not.toHaveBeenCalled();
		expect(updateMock).not.toHaveBeenCalled();
		expect(insertedEvents).toEqual([
			expect.objectContaining({
				action: "blocked",
				fromReplicas: 2,
				toReplicas: 4,
				reason: expect.stringContaining("Only 2 of 4 replicas fit"),
			}),
		]);

		const result = await setApplicationReplicas({
			application: application(),
			replicas: 4,
			userId: "user-1",
			acknowledgeWarnings: true,
		});
		expect(result).toMatchObject({ from: 2, to: 4, applied: true });
		expect(insertedEvents.at(-1)).toMatchObject({
			action: "scale_up",
			details: expect.objectContaining({
				capacityShortfallAcknowledged: expect.stringContaining(
					"Only 2 of 4 replicas fit",
				),
			}),
		});
	});

	it("records no acknowledged shortfall when the request fits", async () => {
		await setApplicationReplicas({
			application: application(),
			replicas: 3,
			userId: "user-1",
			acknowledgeWarnings: true,
		});

		expect(insertedEvents.at(-1)).toMatchObject({
			details: expect.objectContaining({ capacityShortfallAcknowledged: null }),
		});
	});

	it("checks capacity before saving a count for a stopped service", async () => {
		liveService = replicatedService(0, CPU);

		await expect(
			setApplicationReplicas({
				application: application(),
				replicas: 3,
				userId: "user-1",
			}),
		).rejects.toMatchObject({ reason: "insufficient_capacity" });
		expect(setMock).not.toHaveBeenCalled();
	});

	it("counts other services' reservations against the node", async () => {
		liveService = replicatedService(1, CPU);
		listNodesMock.mockResolvedValue([
			{
				...node,
				Description: {
					...node.Description,
					Resources: { NanoCPUs: 3 * CPU, MemoryBytes: 8 * 1024 ** 3 },
				},
			},
		]);
		listTasksMock.mockResolvedValue([
			{
				ServiceID: "other",
				NodeID: "node-1",
				DesiredState: "running",
				Status: { State: "running" },
				Spec: { Resources: { Reservations: { NanoCPUs: 2 * CPU } } },
			},
		]);

		await expect(
			setApplicationReplicas({
				application: application({ replicas: 1 }),
				replicas: 2,
				userId: "user-1",
			}),
		).rejects.toMatchObject({ reason: "insufficient_capacity" });
	});

	it("skips the capacity check when scaling down", async () => {
		liveService = replicatedService(4, 10 * CPU);

		await setApplicationReplicas({
			application: application({ replicas: 4 }),
			replicas: 3,
			userId: "user-1",
		});

		expect(listNodesMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledTimes(1);
	});

	it("still scales when the capacity estimate cannot be read", async () => {
		liveService = replicatedService(2, CPU);
		listNodesMock.mockRejectedValue(
			new Error("This node is not a swarm manager"),
		);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const result = await setApplicationReplicas({
			application: application(),
			replicas: 4,
			userId: "user-1",
		});

		expect(result.applied).toBe(true);
	});

	it("serializes concurrent requests for the same application", async () => {
		const [first, second] = await Promise.all([
			setApplicationReplicas({
				application: application(),
				replicas: 3,
				userId: "user-1",
			}),
			setApplicationReplicas({
				application: application(),
				replicas: 5,
				userId: "user-2",
			}),
		]);

		expect(first).toMatchObject({ from: 2, to: 3, applied: true });
		expect(second).toMatchObject({ from: 3, to: 5, applied: true });
		expect(liveService?.Spec.Mode).toEqual({ Replicated: { Replicas: 5 } });
	});
});
