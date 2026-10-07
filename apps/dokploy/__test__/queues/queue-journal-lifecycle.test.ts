import { describe, expect, it, vi } from "vitest";
import {
	InMemoryQueue,
	type QueueJournal,
} from "../../server/queues/in-memory-queue";
import type { DeploymentJob } from "../../server/queues/queue-types";

/**
 * The in-memory queue reports every job's life cycle to a journal so a durable
 * copy can be kept (deployment_queue_job). These tests pin the contract the
 * journal relies on: a row is written on enqueue, flipped on start, and removed
 * when the job completes, fails or is cancelled - and a broken journal never
 * blocks the queue.
 */

const appJob = (applicationId: string): DeploymentJob => ({
	applicationId,
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
});

const deferred = () => {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, release: resolve, fail: reject };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

const fakeJournal = () => {
	const calls: string[] = [];
	const journal: QueueJournal = {
		enqueued: vi.fn(({ journalId }) => {
			calls.push(`enqueued:${journalId}`);
		}),
		started: vi.fn((journalId) => {
			calls.push(`started:${journalId}`);
		}),
		settled: vi.fn((ids) => {
			calls.push(`settled:${ids.join(",")}`);
		}),
	};
	return { journal, calls };
};

describe("queue journal life cycle", () => {
	it("writes a journal row on enqueue, flips it on start, deletes it on completion", async () => {
		const { journal, calls } = fakeJournal();
		const task = deferred();
		const queue = new InMemoryQueue({
			resolveConcurrency: () => 1,
			journal,
		});
		queue.process(() => task.promise);

		await queue.add(appJob("a"));
		await flush();

		const [job] = await queue.getJobs();
		const id = job?.journalId as string;
		expect(id).toBeTruthy();
		expect(journal.enqueued).toHaveBeenCalledWith({
			journalId: id,
			data: appJob("a"),
		});
		expect(calls).toEqual([`enqueued:${id}`, `started:${id}`]);

		task.release();
		await flush();
		expect(calls).toEqual([`enqueued:${id}`, `started:${id}`, `settled:${id}`]);
	});

	it("deletes the row when the job fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { journal, calls } = fakeJournal();
		const queue = new InMemoryQueue({
			resolveConcurrency: () => 1,
			journal,
		});
		queue.process(() => Promise.reject(new Error("boom")));

		await queue.add(appJob("a"));
		await flush();

		expect(calls.filter((c) => c.startsWith("settled:"))).toHaveLength(1);
		vi.restoreAllMocks();
	});

	it("deletes the rows of cancelled waiting jobs (removeWaiting, clearWaiting, remove)", async () => {
		const { journal } = fakeJournal();
		const blocker = deferred();
		const queue = new InMemoryQueue({
			resolveConcurrency: () => 1,
			journal,
		});
		queue.process(() => blocker.promise);

		await queue.add(appJob("busy")); // starts and blocks the only slot
		await queue.add(appJob("x"));
		await queue.add(appJob("y"));
		await queue.add(appJob("z"));
		await flush();

		const waiting = await queue.getJobs(["waiting"]);
		const byApp = (id: string) =>
			waiting.find(
				(j) => (j.data as { applicationId: string }).applicationId === id,
			);
		const xId = byApp("x")?.journalId;
		const yId = byApp("y")?.journalId;
		const zId = byApp("z")?.journalId;

		queue.removeWaiting(
			(data) => (data as { applicationId?: string }).applicationId === "x",
		);
		expect(journal.settled).toHaveBeenLastCalledWith([xId]);

		await byApp("y")?.remove();
		expect(journal.settled).toHaveBeenLastCalledWith([yId]);

		queue.clearWaiting();
		expect(journal.settled).toHaveBeenLastCalledWith([zId]);

		blocker.release();
	});

	it("does not call the journal for a removal that matched nothing", async () => {
		const { journal } = fakeJournal();
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		queue.removeWaiting(() => true);
		queue.clearWaiting();
		await queue.remove("job-404");
		expect(journal.settled).not.toHaveBeenCalled();
	});

	it("still enqueues in memory when the journal write fails", async () => {
		const journal: QueueJournal = {
			enqueued: () => Promise.reject(new Error("db down")),
			started: () => {
				throw new Error("db down");
			},
			settled: () => Promise.reject(new Error("db down")),
		};
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		queue.process(async (job) => {
			ran.push((job.data as { applicationId: string }).applicationId);
		});

		await expect(queue.add(appJob("a"))).resolves.toEqual({ id: "job-1" });
		await flush();

		expect(ran).toEqual(["a"]);
	});

	it("keeps FIFO order by call order even when the journal write is slow", async () => {
		const slow = deferred();
		const journal: QueueJournal = {
			enqueued: ({ data }) =>
				(data as { applicationId: string }).applicationId === "first"
					? slow.promise
					: undefined,
			started: () => {},
			settled: () => {},
		};
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		const first = queue.add(appJob("first"));
		await queue.add(appJob("second"));
		queue.process(async (job) => {
			ran.push((job.data as { applicationId: string }).applicationId);
		});
		await flush();
		expect(ran).toEqual(["first", "second"]);
		slow.release();
		await first;
	});
});

describe("addRestored", () => {
	it("puts restored jobs ahead of newer ones, in order, without journaling them again", async () => {
		const { journal } = fakeJournal();
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });

		await queue.add(appJob("fresh")); // arrived after boot, before the restore
		const added = queue.addRestored([
			{ journalId: "j1", data: appJob("old-1"), timestamp: 10 },
			{ journalId: "j2", data: appJob("old-2"), timestamp: 20 },
		]);
		expect(added).toBe(2);
		expect(journal.enqueued).toHaveBeenCalledTimes(1); // only "fresh"

		queue.process(async (job) => {
			ran.push((job.data as { applicationId: string }).applicationId);
		});
		await flush();
		await flush();

		expect(ran).toEqual(["old-1", "old-2", "fresh"]);
	});

	it("keeps the per-service ordering of restored jobs for the same service", async () => {
		const gate = deferred();
		const order: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 5 });
		queue.addRestored([
			{
				journalId: "j1",
				data: { ...appJob("same"), titleLog: "one" },
				timestamp: 1,
			},
			{
				journalId: "j2",
				data: { ...appJob("same"), titleLog: "two" },
				timestamp: 2,
			},
		]);
		queue.process(async (job) => {
			order.push(job.data.titleLog);
			await gate.promise;
		});
		await flush();
		// Same service: strictly one at a time.
		expect(order).toEqual(["one"]);
		gate.release();
		await flush();
		await flush();
		expect(order).toEqual(["one", "two"]);
	});

	it("skips journal ids that are already queued or running", async () => {
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		const first = queue.addRestored([
			{ journalId: "j1", data: appJob("a"), timestamp: 1 },
		]);
		const second = queue.addRestored([
			{ journalId: "j1", data: appJob("a"), timestamp: 1 },
			{ journalId: "j2", data: appJob("b"), timestamp: 2 },
		]);
		expect(first).toBe(1);
		expect(second).toBe(1);
		expect(queue.hasJournalId("j1")).toBe(true);
		expect(queue.hasJournalId("nope")).toBe(false);
		expect(await queue.getJobs(["waiting"])).toHaveLength(2);
	});
});

describe("graceful shutdown", () => {
	it("stops starting jobs after close() and waits for the running one", async () => {
		const gate = deferred();
		const started: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.process(async (job) => {
			started.push((job.data as { applicationId: string }).applicationId);
			await gate.promise;
		});
		await queue.add(appJob("running"));
		await queue.add(appJob("waiting"));
		await flush();

		await queue.close();
		const idle = queue.waitForIdle(1_000);
		gate.release();

		await expect(idle).resolves.toBe(true);
		await flush();
		// The waiting job was NOT started by the finishing one.
		expect(started).toEqual(["running"]);
		expect(await queue.getJobs(["waiting"])).toHaveLength(1);
	});

	it("gives up waiting after the grace period", async () => {
		const gate = deferred();
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.process(() => gate.promise);
		await queue.add(appJob("stuck"));
		await flush();

		await expect(queue.waitForIdle(20)).resolves.toBe(false);
		gate.release();
	});
});
