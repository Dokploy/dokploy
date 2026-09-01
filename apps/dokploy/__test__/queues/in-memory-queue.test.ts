import { beforeEach, describe, expect, it } from "vitest";
import {
	getGroup,
	getPartition,
	InMemoryQueue,
	LOCAL_PARTITION,
} from "../../server/queues/in-memory-queue";
import type { DeploymentJob } from "../../server/queues/queue-types";

const appJob = (applicationId: string, serverId?: string): DeploymentJob => ({
	applicationId,
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "application",
	serverId,
});

const composeJob = (composeId: string, serverId?: string): DeploymentJob => ({
	composeId,
	titleLog: "deploy",
	descriptionLog: "",
	type: "deploy",
	applicationType: "compose",
	serverId,
});

/** A controllable async task: resolves only when `release()` is called. */
const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, release: resolve };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("getPartition / getGroup", () => {
	it("partitions by serverId, falling back to the local partition", () => {
		expect(getPartition(appJob("a"))).toBe(LOCAL_PARTITION);
		expect(getPartition(appJob("a", "server-1"))).toBe("server-1");
	});

	it("groups applications and compose by their id", () => {
		expect(getGroup(appJob("a"))).toBe("application:a");
		expect(getGroup(composeJob("c"))).toBe("compose:c");
	});
});

describe("InMemoryQueue concurrency", () => {
	let nowValue = 0;
	const now = () => ++nowValue;

	beforeEach(() => {
		nowValue = 0;
	});

	it("runs different applications concurrently up to the limit", async () => {
		const tasks = new Map<string, ReturnType<typeof deferred>>();
		const started: string[] = [];

		const queue = new InMemoryQueue({ resolveConcurrency: () => 2, now });
		queue.process(async (job) => {
			const id = (job.data as any).applicationId;
			started.push(id);
			const d = deferred();
			tasks.set(id, d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("a"));
		await queue.add(appJob("b"));
		await queue.add(appJob("c"));
		await flush();

		// Concurrency 2 -> only a and b start, c waits.
		expect(started).toEqual(["a", "b"]);

		tasks.get("a")!.release();
		await flush();

		// A slot freed -> c starts.
		expect(started).toEqual(["a", "b", "c"]);
	});

	it("serializes jobs of the same application (per-group FIFO)", async () => {
		const tasks: Array<ReturnType<typeof deferred>> = [];
		const started: number[] = [];
		let counter = 0;

		const queue = new InMemoryQueue({ resolveConcurrency: () => 5, now });
		queue.process(async () => {
			started.push(++counter);
			const d = deferred();
			tasks.push(d);
			await d.promise;
		});
		await queue.run();

		// Two deploys of the SAME app, even with concurrency 5.
		await queue.add(appJob("same"));
		await queue.add(appJob("same"));
		await flush();

		// Only the first one runs; the second waits for the group to free.
		expect(started).toEqual([1]);

		tasks[0]!.release();
		await flush();

		expect(started).toEqual([1, 2]);
	});

	it("isolates concurrency per server partition", async () => {
		const started: string[] = [];
		const tasks = new Map<string, ReturnType<typeof deferred>>();

		// server-1 allows 1, server-2 allows 1, but they are independent.
		const queue = new InMemoryQueue({
			resolveConcurrency: () => 1,
			now,
		});
		queue.process(async (job) => {
			const id = `${job.data.serverId}:${(job.data as any).applicationId}`;
			started.push(id);
			const d = deferred();
			tasks.set(id, d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("a", "server-1"));
		await queue.add(appJob("b", "server-2"));
		await flush();

		// One per partition runs in parallel despite concurrency 1 each.
		expect(started.sort()).toEqual(["server-1:a", "server-2:b"]);
	});

	it("honors a different concurrency per server", async () => {
		const started: string[] = [];
		const tasks = new Map<string, ReturnType<typeof deferred>>();

		// server-fast allows 2, server-slow allows 1.
		const queue = new InMemoryQueue({
			resolveConcurrency: (partition) => (partition === "server-fast" ? 2 : 1),
			now,
		});
		queue.process(async (job) => {
			const id = `${job.data.serverId}:${(job.data as any).applicationId}`;
			started.push(id);
			const d = deferred();
			tasks.set(id, d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("a", "server-fast"));
		await queue.add(appJob("b", "server-fast"));
		await queue.add(appJob("c", "server-slow"));
		await queue.add(appJob("d", "server-slow"));
		await flush();

		// server-fast runs 2 in parallel; server-slow only 1.
		expect(started.sort()).toEqual([
			"server-fast:a",
			"server-fast:b",
			"server-slow:c",
		]);

		// Free a server-slow slot -> its queued app starts.
		tasks.get("server-slow:c")!.release();
		await flush();
		expect(started).toContain("server-slow:d");
	});

	it("serializes the same app on a server even with spare concurrency", async () => {
		const started: number[] = [];
		const tasks: Array<ReturnType<typeof deferred>> = [];
		let counter = 0;

		// Plenty of room (concurrency 2) but two deploys of the SAME app.
		const queue = new InMemoryQueue({ resolveConcurrency: () => 2, now });
		queue.process(async () => {
			started.push(++counter);
			const d = deferred();
			tasks.push(d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("app-x", "server-1"));
		await queue.add(appJob("app-x", "server-1"));
		await flush();

		// Only one build of app-x runs despite 2 free slots.
		expect(started).toEqual([1]);

		tasks[0]!.release();
		await flush();
		expect(started).toEqual([1, 2]);
	});

	it("clamps concurrency below 1 up to 1 (license-disabled behaviour)", async () => {
		const started: string[] = [];
		const tasks = new Map<string, ReturnType<typeof deferred>>();

		// Simulate a non-licensed resolver returning 0 — must still run 1.
		const queue = new InMemoryQueue({ resolveConcurrency: () => 0, now });
		queue.process(async (job) => {
			const id = (job.data as any).applicationId;
			started.push(id);
			const d = deferred();
			tasks.set(id, d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("a"));
		await queue.add(appJob("b"));
		await flush();

		expect(started).toEqual(["a"]);
	});

	it("picks up concurrency changes between scheduling ticks", async () => {
		const started: string[] = [];
		const tasks = new Map<string, ReturnType<typeof deferred>>();
		let limit = 1;

		const queue = new InMemoryQueue({
			resolveConcurrency: () => limit,
			now,
		});
		queue.process(async (job) => {
			const id = (job.data as any).applicationId;
			started.push(id);
			const d = deferred();
			tasks.set(id, d);
			await d.promise;
		});
		await queue.run();

		await queue.add(appJob("a"));
		await queue.add(appJob("b"));
		await flush();
		expect(started).toEqual(["a"]);

		// Raise the limit (e.g. license activated) and release the running job
		// so a new tick observes the new concurrency.
		limit = 2;
		tasks.get("a")!.release();
		await flush();

		expect(started).toContain("b");
	});
});

describe("InMemoryQueue job management", () => {
	it("lists waiting jobs and removes them by predicate", async () => {
		const block = deferred();
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.process(async () => {
			await block.promise;
		});
		await queue.run();

		await queue.add(appJob("running"));
		await queue.add(appJob("waiting-1"));
		await queue.add(composeJob("waiting-2"));
		await flush();

		const waiting = await queue.getJobs(["waiting"]);
		expect(waiting.map((j) => j.data)).toHaveLength(2);

		const removed = queue.removeWaiting(
			(data) => (data as any).applicationId === "waiting-1",
		);
		expect(removed).toBe(1);

		const after = await queue.getJobs(["waiting"]);
		expect(after).toHaveLength(1);
	});

	it("clears all waiting jobs", async () => {
		const block = deferred();
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.process(async () => {
			await block.promise;
		});
		await queue.run();

		await queue.add(appJob("running"));
		await queue.add(appJob("waiting-1"));
		await queue.add(appJob("waiting-2"));
		await flush();

		expect(queue.clearWaiting()).toBe(2);
		expect(await queue.getJobs(["waiting"])).toHaveLength(0);
	});

	it("starts processing as soon as a processor is registered", async () => {
		const started: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 5 });

		// No processor yet -> jobs queue but do not run.
		await queue.add(appJob("a"));
		await flush();
		expect(started).toEqual([]);

		// Registering the processor auto-starts the queue (no separate run()).
		queue.process(async (job) => {
			started.push((job.data as any).applicationId);
		});
		await flush();
		expect(started).toEqual(["a"]);
	});

	it("continues scheduling after a job throws", async () => {
		const started: string[] = [];
		const queue = new InMemoryQueue({ resolveConcurrency: () => 1 });
		queue.process(async (job) => {
			const id = (job.data as any).applicationId;
			started.push(id);
			if (id === "a") throw new Error("boom");
		});
		await queue.run();

		await queue.add(appJob("a"));
		await queue.add(appJob("b"));
		await flush();

		expect(started).toEqual(["a", "b"]);
	});
});
