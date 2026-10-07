import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryQueue } from "../../server/queues/in-memory-queue";
import {
	gateWorkerUntilRestored,
	RESTORE_GATE_TIMEOUT_MS,
	registerShutdownHandler,
	SHUTDOWN_FLUSH_MS,
	SHUTDOWN_GRACE_MS,
} from "../../server/queues/lifecycle";
import type { DeploymentJob } from "../../server/queues/queue-types";

const appJob = (applicationId: string): DeploymentJob => ({
	applicationId,
	titleLog: applicationId,
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("InMemoryQueue pause / resume", () => {
	it("holds jobs while paused (still accepting them) and runs them in order on resume", async () => {
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.pause();
		queue.process(async (job) => {
			ran.push(job.data.titleLog);
		});

		await queue.add(appJob("live"));
		// The boot replay puts the older job ahead of the live one.
		queue.addRestored([
			{ journalId: "j1", data: appJob("restored"), timestamp: 1 },
		]);
		await flush();
		expect(ran).toEqual([]);
		expect(await queue.getJobs(["waiting"])).toHaveLength(2);

		queue.resume();
		await flush();
		await flush();
		expect(ran).toEqual(["restored", "live"]);
	});

	it("does not start anything on resume after close()", async () => {
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.pause();
		queue.process(async (job) => {
			ran.push(job.data.titleLog);
		});
		await queue.add(appJob("a"));
		await queue.close();
		queue.resume();
		await flush();
		expect(ran).toEqual([]);
	});
});

describe("gateWorkerUntilRestored", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("pauses immediately and resumes once when opened", () => {
		const queue = { pause: vi.fn(), resume: vi.fn() };
		const gate = gateWorkerUntilRestored(queue);
		expect(queue.pause).toHaveBeenCalledTimes(1);
		expect(queue.resume).not.toHaveBeenCalled();

		gate.open();
		gate.open();
		expect(queue.resume).toHaveBeenCalledTimes(1);

		// The safety timer was cleared.
		vi.advanceTimersByTime(RESTORE_GATE_TIMEOUT_MS * 2);
		expect(queue.resume).toHaveBeenCalledTimes(1);
	});

	it("opens by itself after the safety timeout so a broken restore cannot block deploys", () => {
		const queue = { pause: vi.fn(), resume: vi.fn() };
		gateWorkerUntilRestored(queue);

		vi.advanceTimersByTime(RESTORE_GATE_TIMEOUT_MS - 1);
		expect(queue.resume).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(queue.resume).toHaveBeenCalledTimes(1);
	});

	it("the safety timeout is 30s", () => {
		expect(RESTORE_GATE_TIMEOUT_MS).toBe(30_000);
	});
});

describe("registerShutdownHandler", () => {
	it("keeps grace + flush under the 10s StopGracePeriod with room to spare", () => {
		expect(SHUTDOWN_GRACE_MS + SHUTDOWN_FLUSH_MS).toBeLessThan(8_000);
	});

	it("registers one SIGTERM listener that drains with the budgets, then exits 0", async () => {
		const listeners: Array<() => void> = [];
		const proc = {
			on: vi.fn((_event: "SIGTERM", listener: () => void) => {
				listeners.push(listener);
			}),
		};
		const shutdown = vi.fn(() => Promise.resolve());
		const exit = vi.fn();

		registerShutdownHandler({ shutdown }, proc, exit);
		expect(proc.on).toHaveBeenCalledTimes(1);
		expect(proc.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

		listeners[0]?.();
		await flush();

		expect(shutdown).toHaveBeenCalledWith(SHUTDOWN_GRACE_MS, SHUTDOWN_FLUSH_MS);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("still exits when the drain fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const listeners: Array<() => void> = [];
		const proc = {
			on: (_event: "SIGTERM", listener: () => void) => {
				listeners.push(listener);
			},
		};
		const exit = vi.fn();

		registerShutdownHandler(
			{ shutdown: () => Promise.reject(new Error("boom")) },
			proc,
			exit,
		);
		listeners[0]?.();
		await flush();

		expect(exit).toHaveBeenCalledWith(0);
		vi.restoreAllMocks();
	});
});
