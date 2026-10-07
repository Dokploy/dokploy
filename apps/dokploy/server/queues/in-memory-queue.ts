import { randomUUID } from "node:crypto";
import type { DeploymentJob } from "./queue-types";

/**
 * In-memory deployment queue for self-hosted instances.
 *
 * Replaces BullMQ/Redis for deployments. The model is per-group FIFO with a
 * configurable concurrency per partition (server):
 *
 * - Jobs are partitioned by `serverId` (the local web server uses the
 *   `LOCAL_PARTITION` key). Each partition runs up to `concurrency` jobs at
 *   the same time, so two different applications can build concurrently.
 * - Within a partition, jobs that belong to the same group (same application
 *   or compose) never run in parallel — they are serialized FIFO. This avoids
 *   two builds of the same service stepping on each other (same code dir,
 *   same container name, etc).
 *
 * The concurrency is resolved lazily per partition through `resolveConcurrency`
 * so it can be gated by the enterprise license at run time (a non-licensed
 * instance always resolves to 1).
 *
 * The public surface (`add`, `getJobs`, `close`, `on`) mirrors the subset of
 * BullMQ used by the routers so it can be a drop-in replacement.
 *
 * Durability: the queue lives in process memory, so on its own every restart
 * drops the waiting jobs. An optional `journal` (see queue-journal.ts) is told
 * about every job's life cycle (enqueued, started, finished or removed) so a
 * durable copy can be kept and re-enqueued on boot through `addRestored`. The
 * queue stays the executor; the journal only observes and must never be able
 * to break it.
 */

export const LOCAL_PARTITION = "__local__";

export type JobState = "waiting" | "active";

export interface InMemoryJob {
	id: string;
	/** Durable journal id (stable across restarts, unlike `id`). */
	journalId: string;
	name: string;
	data: DeploymentJob;
	timestamp: number;
	processedOn?: number;
	finishedOn?: number;
	failedReason?: string;
	getState: () => Promise<JobState>;
	remove: () => Promise<void>;
}

type Processor = (job: InMemoryJob) => Promise<void>;

/** Resolve the partition key (serverId) a job belongs to. */
export const getPartition = (data: DeploymentJob): string =>
	data.serverId ?? LOCAL_PARTITION;

/** Resolve the FIFO group a job belongs to (the service being deployed). */
export const getGroup = (data: DeploymentJob): string => {
	if (
		data.applicationType === "compose" ||
		data.applicationType === "compose-preview"
	) {
		return `compose:${data.composeId}`;
	}
	return `application:${data.applicationId}`;
};

interface InternalJob {
	id: string;
	journalId: string;
	name: string;
	data: DeploymentJob;
	timestamp: number;
	processedOn?: number;
	finishedOn?: number;
	failedReason?: string;
	state: JobState;
	partition: string;
	group: string;
}

interface Partition {
	waiting: InternalJob[];
	/** Groups currently running in this partition. */
	activeGroups: Set<string>;
	active: InternalJob[];
}

/**
 * Observer of a job's life cycle. The queue calls these without awaiting them
 * (except `enqueued`) and ignores whatever they throw.
 */
export interface QueueJournal {
	/** The job was accepted. Awaited by `add`, so its ack means "durable". */
	enqueued(job: {
		journalId: string;
		data: DeploymentJob;
	}): Promise<void> | void;
	/** The worker picked the job up. */
	started(journalId: string): void;
	/** The job completed, failed or was removed from the queue. */
	settled(journalIds: string[]): void;
}

/** A job read back from the journal after a restart. */
export interface RestoredJob {
	journalId: string;
	data: DeploymentJob;
	/** Original enqueue time, epoch ms. */
	timestamp: number;
}

export interface InMemoryQueueOptions {
	/**
	 * Returns the max number of jobs that may run in parallel for a given
	 * partition. Called on every scheduling tick so license/config changes are
	 * picked up without restarting the queue. Must return a value >= 1.
	 */
	resolveConcurrency: (partition: string) => Promise<number> | number;
	/** Monotonic clock; injectable for tests. Defaults to Date.now. */
	now?: () => number;
	/** Durable record of the queue; see `QueueJournal`. */
	journal?: QueueJournal;
}

export class InMemoryQueue {
	private partitions = new Map<string, Partition>();
	private processor: Processor | null = null;
	private running = false;
	private paused = false;
	private seq = 0;
	private idleWaiters: Array<() => void> = [];
	private readonly resolveConcurrency: InMemoryQueueOptions["resolveConcurrency"];
	private readonly now: () => number;
	private readonly journal?: QueueJournal;

	constructor(options: InMemoryQueueOptions) {
		this.resolveConcurrency = options.resolveConcurrency;
		this.now = options.now ?? (() => Date.now());
		this.journal = options.journal;
	}

	private getPartitionState(key: string): Partition {
		let partition = this.partitions.get(key);
		if (!partition) {
			partition = { waiting: [], activeGroups: new Set(), active: [] };
			this.partitions.set(key, partition);
		}
		return partition;
	}

	/** Run a journal hook; a failing journal must never affect the queue. */
	private notify(call: () => unknown) {
		try {
			const result = call();
			if (result && typeof (result as Promise<unknown>).catch === "function") {
				(result as Promise<unknown>).catch(() => {});
			}
		} catch {
			// The journal reports its own failures.
		}
	}

	/**
	 * Register the worker that processes each job. Registering a processor also
	 * starts the queue: in dev (tsx/Next) the module that calls `run()` and the
	 * module that calls `add()` can resolve to different instances, so we must
	 * not depend on a separate `run()` call to flip `running` on.
	 */
	process(processor: Processor) {
		this.processor = processor;
		this.running = true;
		this.schedule();
	}

	run() {
		this.running = true;
		this.schedule();
		return Promise.resolve();
	}

	async add(data: DeploymentJob): Promise<{ id: string }> {
		const job = this.createJob(data, randomUUID(), this.now());
		// In memory first and synchronously: FIFO order is the call order even
		// when the journal write below is slow.
		this.getPartitionState(job.partition).waiting.push(job);
		this.schedule();
		const journal = this.journal;
		if (journal) {
			try {
				await journal.enqueued({ journalId: job.journalId, data });
			} catch {
				// Never block a deploy on the journal; it reports its own failures.
			}
		}
		return { id: job.id };
	}

	/**
	 * Re-add jobs read back from the journal after a restart. They go to the
	 * FRONT of their partition (in the order given) because they were enqueued
	 * before anything that arrived since boot, and they are not journaled again:
	 * their row already exists. A job whose journal id is already queued or
	 * running is skipped, so a repeated restore cannot duplicate anything.
	 */
	addRestored(jobs: RestoredJob[]): number {
		const known = new Set(this.knownJournalIds());
		const byPartition = new Map<string, InternalJob[]>();
		let added = 0;
		for (const restored of jobs) {
			if (known.has(restored.journalId)) continue;
			known.add(restored.journalId);
			const job = this.createJob(
				restored.data,
				restored.journalId,
				restored.timestamp,
			);
			const list = byPartition.get(job.partition) ?? [];
			list.push(job);
			byPartition.set(job.partition, list);
			added++;
		}
		for (const [key, list] of byPartition) {
			const partition = this.getPartitionState(key);
			partition.waiting = [...list, ...partition.waiting];
		}
		if (added > 0) this.schedule();
		return added;
	}

	private createJob(
		data: DeploymentJob,
		journalId: string,
		timestamp: number,
	): InternalJob {
		return {
			id: `job-${++this.seq}`,
			journalId,
			name: "deployments",
			data,
			timestamp,
			state: "waiting",
			partition: getPartition(data),
			group: getGroup(data),
		};
	}

	private knownJournalIds(): string[] {
		const ids: string[] = [];
		for (const partition of this.partitions.values()) {
			for (const job of partition.waiting) ids.push(job.journalId);
			for (const job of partition.active) ids.push(job.journalId);
		}
		return ids;
	}

	/** True when a job with this journal id is waiting or running. */
	hasJournalId(journalId: string): boolean {
		return this.knownJournalIds().includes(journalId);
	}

	private toPublic(job: InternalJob): InMemoryJob {
		return {
			id: job.id,
			journalId: job.journalId,
			name: job.name,
			data: job.data,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			finishedOn: job.finishedOn,
			getState: () => Promise.resolve(job.state),
			remove: () => this.remove(job.id),
		};
	}

	/** Snapshot of jobs in the requested states (defaults to waiting + active). */
	getJobs(states?: JobState[]): Promise<InMemoryJob[]> {
		const wantWaiting = !states || states.includes("waiting");
		const wantActive = !states || states.includes("active");
		const jobs: InMemoryJob[] = [];
		for (const partition of this.partitions.values()) {
			if (wantWaiting) {
				jobs.push(...partition.waiting.map((job) => this.toPublic(job)));
			}
			if (wantActive) {
				jobs.push(...partition.active.map((job) => this.toPublic(job)));
			}
		}
		return Promise.resolve(jobs);
	}

	/** Remove a single waiting job by id. Active jobs cannot be removed. */
	remove(id: string): Promise<void> {
		for (const partition of this.partitions.values()) {
			const removed = partition.waiting.filter((job) => job.id === id);
			if (removed.length === 0) continue;
			partition.waiting = partition.waiting.filter((job) => job.id !== id);
			this.settle(removed);
			break;
		}
		return Promise.resolve();
	}

	/** Remove waiting jobs matching a predicate. Active jobs are not affected. */
	removeWaiting(predicate: (data: DeploymentJob) => boolean): number {
		const dropped: InternalJob[] = [];
		for (const partition of this.partitions.values()) {
			partition.waiting = partition.waiting.filter((job) => {
				const match = predicate(job.data);
				if (match) dropped.push(job);
				return !match;
			});
		}
		this.settle(dropped);
		return dropped.length;
	}

	/** Drop every waiting job across all partitions. */
	clearWaiting(): number {
		const dropped: InternalJob[] = [];
		for (const partition of this.partitions.values()) {
			dropped.push(...partition.waiting);
			partition.waiting = [];
		}
		this.settle(dropped);
		return dropped.length;
	}

	/** Tell the journal these jobs are gone (finished, failed or cancelled). */
	private settle(jobs: InternalJob[]) {
		const journal = this.journal;
		if (!journal || jobs.length === 0) return;
		const ids = jobs.map((job) => job.journalId);
		this.notify(() => journal.settled(ids));
	}

	on() {
		// No-op: kept for BullMQ API compatibility (error events, etc).
	}

	close() {
		this.running = false;
		return Promise.resolve();
	}

	/**
	 * Hold back processing: jobs can still be added (and journaled) but none
	 * starts until `resume()`. Used to keep the worker idle until the boot replay
	 * has put the previous process's jobs ahead of anything that arrived since.
	 */
	pause() {
		this.paused = true;
	}

	resume() {
		if (!this.paused) return;
		this.paused = false;
		this.schedule();
	}

	/**
	 * Resolve `true` once no job is running, or `false` after `timeoutMs`. Used
	 * by the graceful shutdown: after `close()` nothing new starts, so this only
	 * waits for the jobs already in flight.
	 */
	waitForIdle(timeoutMs: number): Promise<boolean> {
		if (this.activeCount() === 0) return Promise.resolve(true);
		return new Promise((resolve) => {
			const onIdle = () => {
				clearTimeout(timer);
				resolve(true);
			};
			const timer = setTimeout(() => {
				this.idleWaiters = this.idleWaiters.filter((wake) => wake !== onIdle);
				resolve(false);
			}, timeoutMs);
			this.idleWaiters.push(onIdle);
		});
	}

	private activeCount(): number {
		let count = 0;
		for (const partition of this.partitions.values()) {
			count += partition.active.length;
		}
		return count;
	}

	private schedule() {
		if (!this.running || this.paused || !this.processor) return;
		for (const key of this.partitions.keys()) {
			void this.drainPartition(key);
		}
	}

	private async drainPartition(key: string) {
		const partition = this.partitions.get(key);
		if (!partition || !this.processor) return;

		const concurrency = Math.max(1, await this.resolveConcurrency(key));

		// A shutdown can land while the concurrency was being resolved.
		while (
			this.running &&
			!this.paused &&
			partition.active.length < concurrency
		) {
			// First waiting job whose group is not already running.
			const index = partition.waiting.findIndex(
				(job) => !partition.activeGroups.has(job.group),
			);
			if (index === -1) break;

			const job = partition.waiting.splice(index, 1)[0];
			if (!job) break;
			job.state = "active";
			job.processedOn = this.now();
			partition.activeGroups.add(job.group);
			partition.active.push(job);

			const journal = this.journal;
			if (journal) this.notify(() => journal.started(job.journalId));
			void this.runJob(job);
		}
	}

	private async runJob(job: InternalJob) {
		try {
			await this.processor?.(this.toPublic(job));
		} catch (error) {
			job.failedReason = error instanceof Error ? error.message : String(error);
			console.error("In-memory deployment job failed", error);
		} finally {
			job.finishedOn = this.now();
			const partition = this.partitions.get(job.partition);
			if (partition) {
				partition.active = partition.active.filter((j) => j.id !== job.id);
				partition.activeGroups.delete(job.group);
			}
			this.settle([job]);
			if (this.activeCount() === 0) {
				const waiters = this.idleWaiters;
				this.idleWaiters = [];
				for (const wake of waiters) wake();
			}
			// A slot (and possibly the group) freed up — try to schedule more.
			void this.drainPartition(job.partition);
		}
	}
}
