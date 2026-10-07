import type { DeploymentQueueJobRow } from "@dokploy/server/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("../../server/sentry", () => ({ captureError: mocks.captureError }));

// queue-journal imports the journal functions from the barrel; the tests inject
// a fake store, so keep the heavy barrel (and its db) out of the picture.
vi.mock("@dokploy/server", () => ({
	deleteQueueJobs: vi.fn(),
	insertQueueJob: vi.fn(),
	listQueueJobs: vi.fn(),
	markInterruptedFromJournal: vi.fn(),
	markQueueJobActive: vi.fn(),
	requeueInterruptedQueueJobs: vi.fn(),
}));

import { InMemoryQueue } from "../../server/queues/in-memory-queue";
import {
	createQueueJournal,
	type JournalStore,
	MAX_REPLAY_ATTEMPTS,
} from "../../server/queues/queue-journal";
import type { DeploymentJob } from "../../server/queues/queue-types";

/**
 * Boot replay of the deployment queue journal. A fake store stands in for the
 * Postgres table; the real InMemoryQueue is the executor.
 */

const appJob = (applicationId: string, extra = {}): DeploymentJob => ({
	applicationId,
	titleLog: `deploy ${applicationId}`,
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
	...extra,
});

const composeJob = (composeId: string): DeploymentJob => ({
	composeId,
	titleLog: `deploy ${composeId}`,
	descriptionLog: "",
	type: "deploy",
	applicationType: "compose",
});

let seq = 0;
const row = (
	jobId: string,
	payload: unknown,
	state: "waiting" | "active" = "waiting",
	attempts = 0,
): DeploymentQueueJobRow => ({
	jobId,
	seq: ++seq,
	payload: payload as Record<string, unknown>,
	state,
	attempts,
	enqueuedAt: new Date(1_700_000_000_000 + seq * 1000),
	startedAt: state === "active" ? new Date() : null,
});

const makeStore = (rows: DeploymentQueueJobRow[] = []) => {
	const store: JournalStore & { rows: DeploymentQueueJobRow[] } = {
		rows,
		insert: vi.fn(async (jobId, payload) => {
			rows.push(row(jobId, payload));
		}),
		markActive: vi.fn(async (jobId) => {
			const r = rows.find((x) => x.jobId === jobId);
			if (r) r.state = "active";
		}),
		remove: vi.fn(async (ids) => {
			for (const id of ids) {
				const i = rows.findIndex((x) => x.jobId === id);
				if (i >= 0) rows.splice(i, 1);
			}
		}),
		list: vi.fn(async () => [...rows]),
		requeueInterrupted: vi.fn(async (ids) => {
			for (const r of rows) {
				if (ids.includes(r.jobId)) {
					r.state = "waiting";
					r.attempts += 1;
				}
			}
		}),
		markInterrupted: vi.fn(async () => 0),
	};
	return store;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

const titles = (jobs: Array<{ data: DeploymentJob }>) =>
	jobs.map((j) => j.data.titleLog);

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	seq = 0;
});

describe("journal writes", () => {
	it("enqueue writes a row; completion deletes it", async () => {
		const store = makeStore();
		const { journal } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		const gate = new Promise<void>((resolve) => setTimeout(resolve, 5));
		queue.process(() => gate);

		await queue.add(appJob("a"));
		expect(store.insert).toHaveBeenCalledTimes(1);
		expect(store.insert).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				applicationId: "a",
				applicationType: "application",
			}),
		);

		await flush();
		expect(store.markActive).toHaveBeenCalledTimes(1);

		await gate;
		await flush();
		await flush();
		expect(store.remove).toHaveBeenCalledTimes(1);
		expect(store.rows).toHaveLength(0);
	});

	it("a cancel right after the enqueue still deletes the row (writes are ordered)", async () => {
		const store = makeStore();
		const { journal, flush: flushJournal } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		// No processor registered: the job stays waiting.

		await queue.add(appJob("a"));
		queue.clearWaiting();
		await flushJournal();

		expect(store.rows).toHaveLength(0);
		const order = [
			...(store.insert as ReturnType<typeof vi.fn>).mock.invocationCallOrder,
			...(store.remove as ReturnType<typeof vi.fn>).mock.invocationCallOrder,
		];
		expect(order).toEqual([...order].sort((x, y) => x - y));
	});

	it("a journal write failure does not block the enqueue and is reported once", async () => {
		const store = makeStore();
		store.insert = vi.fn(() =>
			Promise.reject(new Error("relation does not exist")),
		);
		const { journal } = createQueueJournal(store);
		const ran: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		queue.process(async (job) => {
			ran.push(job.data.titleLog);
		});

		await expect(queue.add(appJob("a"))).resolves.toBeDefined();
		await expect(queue.add(appJob("b"))).resolves.toBeDefined();
		await flush();

		expect(ran).toEqual(["deploy a", "deploy b"]);
		expect(mocks.captureError).toHaveBeenCalledTimes(1);
		expect(mocks.captureError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ op: "enqueue" }),
		);
	});

	it("does not wait forever for a hung journal write", async () => {
		const store = makeStore();
		store.insert = vi.fn(() => new Promise<void>(() => {}));
		const { journal } = createQueueJournal(store, { timeoutMs: 20 });
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });

		await expect(queue.add(appJob("a"))).resolves.toBeDefined();
		expect(await queue.getJobs(["waiting"])).toHaveLength(1);
	});

	it("one hung write does not wedge the chain: later inserts and deletes still land", async () => {
		const store = makeStore();
		const realInsert = store.insert;
		let first = true;
		store.insert = vi.fn((jobId, payload) => {
			if (first) {
				first = false;
				return new Promise<void>(() => {}); // never settles
			}
			return realInsert(jobId, payload);
		});
		const { journal, flush: flushJournal } = createQueueJournal(store, {
			timeoutMs: 10,
			writeTimeoutMs: 30,
		});
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });

		await queue.add(appJob("hung")); // its insert never returns
		await queue.add(appJob("later"));
		await flushJournal(2_000);

		// The second insert landed behind the hung one...
		expect(
			store.rows.map(
				(r) => (r.payload as { applicationId: string }).applicationId,
			),
		).toEqual(["later"]);

		// ...and so does a delete.
		queue.clearWaiting();
		await flushJournal(2_000);
		expect(store.rows).toHaveLength(0);
		expect(mocks.captureError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining("timed out"),
			}),
			expect.objectContaining({ op: "enqueue" }),
		);
	});
});

describe("boot replay", () => {
	it("re-adds waiting jobs in their original order", async () => {
		const store = makeStore([
			row("j1", appJob("a", { titleLog: "first" })),
			row("j2", composeJob("c")),
			row("j3", appJob("b", { titleLog: "third" })),
		]);
		const { restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const result = await restore(queue);

		expect(result).toEqual({ restored: 3, interrupted: 0, dropped: 0 });
		const waiting = await queue.getJobs(["waiting"]);
		expect(titles(waiting)).toEqual(["first", "deploy c", "third"]);
		expect(waiting.map((j) => j.journalId)).toEqual(["j1", "j2", "j3"]);
		// Restored jobs keep their original enqueue time.
		expect(waiting[0]?.timestamp).toBe(store.rows[0]?.enqueuedAt.getTime());
		// Nothing was journaled twice.
		expect(store.insert).not.toHaveBeenCalled();
		expect(store.requeueInterrupted).toHaveBeenCalledWith([]);
	});

	it("an active job at crash time is marked interrupted, counted and re-added ahead of the waiting ones", async () => {
		const store = makeStore([
			row("j1", appJob("a", { titleLog: "was running" }), "active"),
			row("j2", appJob("b", { titleLog: "was waiting" })),
		]);
		const { restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const result = await restore(queue);

		expect(result).toEqual({ restored: 2, interrupted: 1, dropped: 0 });
		// The deployment record of the active job is closed as an error.
		expect(store.markInterrupted).toHaveBeenCalledTimes(1);
		expect(store.requeueInterrupted).toHaveBeenCalledWith(["j1"]);
		expect(store.rows.find((r) => r.jobId === "j1")).toMatchObject({
			state: "waiting",
			attempts: 1,
		});
		expect(titles(await queue.getJobs(["waiting"]))).toEqual([
			"was running",
			"was waiting",
		]);
	});

	it("runs the replayed jobs through the worker", async () => {
		const store = makeStore([
			row("j1", appJob("a", { titleLog: "one" })),
			row("j2", appJob("b", { titleLog: "two" })),
		]);
		const { journal, restore, flush: flushJournal } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		const ran: string[] = [];
		queue.process(async (job) => {
			ran.push(job.data.titleLog);
		});

		await restore(queue);
		await flush();
		await flush();
		await flushJournal();

		expect(ran).toEqual(["one", "two"]);
		// Completed replays delete their rows.
		expect(store.rows).toHaveLength(0);
	});

	it("is not duplicated when init runs twice", async () => {
		const store = makeStore([row("j1", appJob("a")), row("j2", appJob("b"))]);
		const { restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const first = await restore(queue);
		const second = await restore(queue);

		expect(second).toBe(first);
		expect(store.list).toHaveBeenCalledTimes(1);
		expect(await queue.getJobs(["waiting"])).toHaveLength(2);
	});

	it("is not duplicated when another journal instance replays into the same queue", async () => {
		const store = makeStore([row("j1", appJob("a"))]);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		await createQueueJournal(store).restore(queue);
		await createQueueJournal(store).restore(queue);

		expect(await queue.getJobs(["waiting"])).toHaveLength(1);
	});

	it("never replays jobs enqueued since boot, even if they already finished", async () => {
		const store = makeStore();
		const { journal, restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });
		queue.process(async () => {});

		// Enqueued and completed before the restore reads the journal; make the
		// delete lag so its row is still listed.
		const realRemove = store.remove;
		store.remove = vi.fn(() => new Promise<void>(() => {}));
		await queue.add(appJob("new"));
		await flush();
		store.remove = realRemove;

		const ran: string[] = [];
		queue.process(async (job) => {
			ran.push(job.data.titleLog);
		});
		const result = await restore(queue);

		expect(result.restored).toBe(0);
		await flush();
		expect(ran).toEqual([]);
	});

	it("puts restored jobs ahead of a job that arrived during the boot", async () => {
		const store = makeStore([row("j1", appJob("a", { titleLog: "old" }))]);
		const { journal, restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1, journal });

		await queue.add(appJob("b", { titleLog: "new" }));
		await restore(queue);

		expect(titles(await queue.getJobs(["waiting"]))).toEqual(["old", "new"]);
	});

	it("gives up on a job that was running for too many crashes", async () => {
		const dropped: Record<string, unknown>[] = [];
		const store = makeStore([
			row("j1", appJob("loop"), "active", MAX_REPLAY_ATTEMPTS),
			row("j2", appJob("fine")),
		]);
		const { restore } = createQueueJournal(store, {
			onDropped: (data) => {
				dropped.push(data);
			},
		});
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const result = await restore(queue);

		expect(result).toEqual({ restored: 1, interrupted: 0, dropped: 1 });
		expect(dropped.map((d) => d.titleLog)).toEqual(["deploy loop"]);
		expect(store.rows.map((r) => r.jobId)).toEqual(["j2"]);
	});

	it("drops rows whose payload cannot be run, still handing them to onDropped", async () => {
		const dropped: Record<string, unknown>[] = [];
		const store = makeStore([
			row("bad", { applicationId: "svc", type: "garbage" }),
			row("ok", appJob("a")),
		]);
		const { restore } = createQueueJournal(store, {
			onDropped: (payload) => {
				dropped.push(payload);
			},
		});
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const result = await restore(queue);

		expect(result).toEqual({ restored: 1, interrupted: 0, dropped: 1 });
		expect(store.rows.map((r) => r.jobId)).toEqual(["ok"]);
		expect(dropped).toEqual([{ applicationId: "svc", type: "garbage" }]);
	});

	it("a replay failure is logged, reported and does not throw", async () => {
		const store = makeStore();
		store.list = vi.fn(() => Promise.reject(new Error("db down")));
		const { restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		await expect(restore(queue)).resolves.toEqual({
			restored: 0,
			interrupted: 0,
			dropped: 0,
		});
		expect(mocks.captureError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ op: "restore" }),
		);
	});

	it("still replays when advancing the attempt counter fails", async () => {
		const store = makeStore([row("j1", appJob("a"), "active")]);
		store.requeueInterrupted = vi.fn(() => Promise.reject(new Error("nope")));
		const { restore } = createQueueJournal(store);
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });

		const result = await restore(queue);

		expect(result.restored).toBe(1);
		expect(mocks.captureError).toHaveBeenCalledTimes(1);
	});
});
