import {
	getSwarmServiceUpdateTimeoutMs,
	waitForSwarmServiceUpdate,
} from "@dokploy/server/utils/docker/swarm-update";
import { describe, expect, it, vi } from "vitest";

type DockerClient = Parameters<typeof waitForSwarmServiceUpdate>[0];
type DockerService = Parameters<typeof waitForSwarmServiceUpdate>[1];

const createService = (
	inspects: Array<Record<string, unknown>>,
	serviceName = "test-service",
) => {
	const inspect = vi.fn();
	for (const value of inspects) inspect.mockResolvedValueOnce(value);

	return {
		id: serviceName,
		inspect,
	} as unknown as DockerService;
};

describe("waitForSwarmServiceUpdate", () => {
	it("waits for the current update to complete", async () => {
		const service = createService([
			{
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: { State: "updating", StartedAt: "operation-1" },
			},
			{
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: { State: "completed", StartedAt: "operation-1" },
			},
		]);
		const docker = { listTasks: vi.fn() } as unknown as DockerClient;
		const sleepFn = vi.fn(async () => undefined);

		await waitForSwarmServiceUpdate(docker, service, {
			expectedForceUpdate: 4,
			pollIntervalMs: 1,
			previousVersion: 10,
			sleepFn,
			timeoutMs: 1_000,
		});

		expect(service.inspect).toHaveBeenCalledTimes(2);
		expect(sleepFn).toHaveBeenCalledOnce();
		expect(docker.listTasks).not.toHaveBeenCalled();
	});

	it("ignores a stale completed status from the previous service version", async () => {
		const service = createService([
			{ Version: { Index: 10 }, UpdateStatus: { State: "completed" } },
			{
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: { State: "completed", StartedAt: "operation-1" },
			},
		]);
		const docker = { listTasks: vi.fn() } as unknown as DockerClient;
		const sleepFn = vi.fn(async () => undefined);

		await waitForSwarmServiceUpdate(docker, service, {
			expectedForceUpdate: 4,
			pollIntervalMs: 1,
			previousVersion: 10,
			sleepFn,
			timeoutMs: 1_000,
		});

		expect(service.inspect).toHaveBeenCalledTimes(2);
		expect(sleepFn).toHaveBeenCalledOnce();
	});

	it("reports an automatic rollback with the failed task reason", async () => {
		const service = createService([
			{
				Version: { Index: 12 },
				Spec: { TaskTemplate: { ForceUpdate: 3 } },
				UpdateStatus: {
					State: "rollback_completed",
					Message: "rollback completed",
					StartedAt: "operation-1",
				},
			},
		]);
		const docker = {
			listTasks: vi.fn(async () => [
				{
					Version: { Index: 20 },
					Spec: { ForceUpdate: 4 },
					Status: {
						State: "failed",
						Err: "task: unhealthy container",
						ContainerStatus: { ExitCode: 137 },
					},
				},
				{
					Version: { Index: 21 },
					Spec: { ForceUpdate: 3 },
					Status: { State: "failed", Err: "older failure" },
				},
			]),
		} as unknown as DockerClient;

		await expect(
			waitForSwarmServiceUpdate(docker, service, {
				expectedForceUpdate: 4,
				previousVersion: 10,
				timeoutMs: 1_000,
			}),
		).rejects.toThrow(
			"Swarm service update rolled back: rollback completed. Latest task failure: task: unhealthy container, exit code 137",
		);
	});

	it("reports a paused update even when task lookup fails", async () => {
		const service = createService([
			{
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: {
					State: "paused",
					Message: "update paused",
					StartedAt: "operation-1",
				},
			},
		]);
		const docker = {
			listTasks: vi.fn(async () => {
				throw new Error("task lookup failed");
			}),
		} as unknown as DockerClient;

		await expect(
			waitForSwarmServiceUpdate(docker, service, {
				expectedForceUpdate: 4,
				previousVersion: 10,
				timeoutMs: 1_000,
			}),
		).rejects.toThrow("Swarm service update paused: update paused");
	});

	it("rejects a terminal state from a concurrent service update", async () => {
		const service = createService([
			{
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: { State: "updating", StartedAt: "operation-1" },
			},
			{
				Version: { Index: 12 },
				Spec: { TaskTemplate: { ForceUpdate: 5 } },
				UpdateStatus: { State: "completed", StartedAt: "operation-2" },
			},
		]);
		const docker = { listTasks: vi.fn() } as unknown as DockerClient;

		await expect(
			waitForSwarmServiceUpdate(docker, service, {
				expectedForceUpdate: 4,
				pollIntervalMs: 1,
				previousVersion: 10,
				sleepFn: async () => undefined,
				timeoutMs: 1_000,
			}),
		).rejects.toThrow(
			"Swarm service update was superseded by another operation",
		);
	});

	it("rejects a concurrent update observed before the expected operation", async () => {
		const service = createService([
			{
				Version: { Index: 12 },
				Spec: { TaskTemplate: { ForceUpdate: 5 } },
				UpdateStatus: { State: "completed", StartedAt: "operation-2" },
			},
		]);
		const docker = { listTasks: vi.fn() } as unknown as DockerClient;

		await expect(
			waitForSwarmServiceUpdate(docker, service, {
				expectedForceUpdate: 4,
				previousVersion: 10,
				timeoutMs: 1_000,
			}),
		).rejects.toThrow(
			"Swarm service update was superseded by another operation",
		);
	});

	it("times out instead of waiting forever", async () => {
		const service = {
			id: "test-service",
			inspect: vi.fn(async () => ({
				Version: { Index: 11 },
				Spec: { TaskTemplate: { ForceUpdate: 4 } },
				UpdateStatus: { State: "updating", StartedAt: "operation-1" },
			})),
		} as unknown as DockerService;
		const docker = { listTasks: vi.fn() } as unknown as DockerClient;
		let now = 0;

		await expect(
			waitForSwarmServiceUpdate(docker, service, {
				expectedForceUpdate: 4,
				nowFn: () => now,
				pollIntervalMs: 1_000,
				previousVersion: 10,
				sleepFn: async (milliseconds) => {
					now += milliseconds;
				},
				timeoutMs: 2_000,
			}),
		).rejects.toThrow(
			"Swarm service update did not finish within 2 seconds (last state: updating)",
		);
	});
});

describe("getSwarmServiceUpdateTimeoutMs", () => {
	it("accounts for update and rollback batches", () => {
		expect(
			getSwarmServiceUpdateTimeoutMs({
				replicas: 10,
				updateConfig: {
					Parallelism: 1,
					Monitor: 30_000_000_000,
					Delay: 10_000_000_000,
				},
				rollbackConfig: {
					Parallelism: 1,
					Monitor: 30_000_000_000,
					Delay: 10_000_000_000,
				},
			}),
		).toBe(840_000);
	});

	it("keeps small updates above a safe minimum", () => {
		expect(getSwarmServiceUpdateTimeoutMs({ replicas: 1 })).toBe(120_000);
	});

	it("does not truncate a valid rollout window", () => {
		expect(getSwarmServiceUpdateTimeoutMs({ replicas: 100 })).toBe(6_060_000);
	});
});
