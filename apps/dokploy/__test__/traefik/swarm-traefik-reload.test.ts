import {
	ensureTraefikRunning,
	initializeTraefikService,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));
vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const task = (forceUpdate: number, state = "running", error?: string) => ({
	ID: `task-${forceUpdate}`,
	DesiredState: state === "failed" ? "shutdown" : "running",
	Spec: { ForceUpdate: forceUpdate },
	Status: { State: state, Err: error },
});

describe("Swarm Traefik reload", () => {
	const inspect = vi.fn();
	const update = vi.fn();
	const listTasks = vi.fn();
	const serviceInfo = (forceUpdate: number, updateState?: string) => ({
		Version: { Index: 12 },
		Spec: {
			Mode: { Replicated: { Replicas: 1 } },
			TaskTemplate: { ForceUpdate: forceUpdate },
		},
		UpdateStatus: updateState
			? { State: updateState, Message: "task exited" }
			: undefined,
	});
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		inspect
			.mockResolvedValueOnce(serviceInfo(2))
			.mockResolvedValue(serviceInfo(3));
		update.mockResolvedValue(undefined);
		listTasks.mockResolvedValue([task(3)]);
		mocks.getRemoteDocker.mockResolvedValue({
			getService: () => ({ inspect, update }),
			listTasks,
		});
	});
	afterEach(() => vi.useRealTimers());

	it("waits for the replacement instead of accepting the old running task", async () => {
		listTasks.mockResolvedValue([task(2)]);
		let finished = false;
		const reload = ensureTraefikRunning("swarm-server", true).then(() => {
			finished = true;
		});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({
				TaskTemplate: { ForceUpdate: 3 },
			}),
		);
		expect(finished).toBe(false);
		listTasks.mockResolvedValue([task(2), task(3, "starting")]);
		await vi.advanceTimersByTimeAsync(2000);
		expect(finished).toBe(false);
		listTasks.mockResolvedValue([task(3)]);
		await vi.advanceTimersByTimeAsync(6000);
		await reload;
		expect(finished).toBe(true);
	});
	it("reports failure of the replacement even while the old task is running", async () => {
		listTasks.mockResolvedValue([
			task(2),
			task(3, "failed", "invalid Traefik configuration"),
		]);
		const result = ensureTraefikRunning("swarm-server", true).catch(
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();
		expect(await result).toMatchObject({
			message: expect.stringContaining("invalid Traefik configuration"),
		});
	});
	it("reports a paused or rolled-back update", async () => {
		inspect
			.mockReset()
			.mockResolvedValueOnce(serviceInfo(2))
			.mockResolvedValue(serviceInfo(3, "paused"));
		const result = ensureTraefikRunning("swarm-server", true).catch(
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();
		expect(await result).toMatchObject({
			message: expect.stringContaining("task exited"),
		});
	});
	it("times out if only an old task remains running", async () => {
		listTasks.mockResolvedValue([task(2)]);
		const result = ensureTraefikRunning("swarm-server", true).catch(
			(error: Error) => error,
		);
		await vi.advanceTimersByTimeAsync(65_000);
		expect(await result).toMatchObject({
			message: expect.stringContaining("Timed out"),
		});
	});
	it("leaves automatic service recovery to Swarm", async () => {
		expect(await ensureTraefikRunning("swarm-server")).toBeNull();
		expect(update).not.toHaveBeenCalled();
		expect(listTasks).not.toHaveBeenCalled();
	});
	it("waits for a settings update to replace its task before network reconnection", async () => {
		listTasks.mockResolvedValue([task(2)]);
		let finished = false;
		const change = initializeTraefikService({}).then(() => {
			finished = true;
		});
		await vi.advanceTimersByTimeAsync(2000);
		expect(finished).toBe(false);
		listTasks.mockResolvedValue([task(3)]);
		await vi.advanceTimersByTimeAsync(6000);
		await change;
		expect(finished).toBe(true);
	});
	it("requires all configured replacement replicas to stabilize", async () => {
		inspect
			.mockReset()
			.mockResolvedValueOnce(serviceInfo(2))
			.mockResolvedValue({
				...serviceInfo(3),
				Spec: { ...serviceInfo(3).Spec, Mode: { Replicated: { Replicas: 2 } } },
			});
		let finished = false;
		const reload = ensureTraefikRunning("swarm-server", true).then(() => {
			finished = true;
		});
		await vi.advanceTimersByTimeAsync(6000);
		expect(finished).toBe(false);
		listTasks.mockResolvedValue([
			task(3),
			{ ...task(3), ID: "second-replica" },
		]);
		await vi.advanceTimersByTimeAsync(6000);
		await reload;
		expect(finished).toBe(true);
	});
});
