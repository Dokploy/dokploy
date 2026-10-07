// The barrel, not a deep import: the esbuild build (packages: "external") would
// otherwise bundle a second copy of the module next to the one the barrel loads.
import {
	deleteQueueJobs,
	insertQueueJob,
	listQueueJobs,
	markInterruptedFromJournal,
	markQueueJobActive,
	requeueInterruptedQueueJobs,
} from "@dokploy/server";
// Type-only, erased at build time: no second module copy.
import type { DeploymentQueueJobRow } from "@dokploy/server/db/schema";
import { captureError } from "../sentry";
import type { QueueJournal, RestoredJob } from "./in-memory-queue";
import type { DeploymentJob } from "./queue-types";

/**
 * Durable journal of the deployment queue.
 *
 * `createQueueJournal` returns the `QueueJournal` the in-memory queue reports
 * to, plus `restore`, which re-enqueues on boot whatever the previous process
 * left unfinished. The rules:
 *
 * - Postgres is the journal, memory is the executor. A journal failure is
 *   logged and reported, never thrown into a deploy.
 * - Journal writes go through one serial chain, so a job's insert always lands
 *   before its start/delete, even when a cancel follows an enqueue immediately.
 * - `restore` only runs once per process, never re-adds a job that is already
 *   queued, and never touches jobs enqueued since boot (it remembers their ids).
 */

/** A job found `active` after a crash is replayed at most this many times. */
export const MAX_REPLAY_ATTEMPTS = 3;
/** Longest `add()` waits for the journal write before moving on. */
export const ENQUEUE_JOURNAL_TIMEOUT_MS = 5_000;
/**
 * Longest any single journal write may hold the serial chain. Without it one
 * hung Postgres call would wedge every later write behind it.
 */
export const WRITE_TIMEOUT_MS = 5_000;

export interface JournalStore {
	insert(jobId: string, payload: Record<string, unknown>): Promise<void>;
	markActive(jobId: string): Promise<void>;
	remove(jobIds: string[]): Promise<void>;
	list(): Promise<DeploymentQueueJobRow[]>;
	requeueInterrupted(jobIds: string[]): Promise<void>;
	/** Close the deployments of jobs that were active at crash time. */
	markInterrupted(): Promise<unknown>;
}

export const dbJournalStore: JournalStore = {
	insert: insertQueueJob,
	markActive: markQueueJobActive,
	remove: deleteQueueJobs,
	list: listQueueJobs,
	requeueInterrupted: requeueInterruptedQueueJobs,
	markInterrupted: markInterruptedFromJournal,
};

/** The slice of the queue `restore` needs. */
export interface RestorableQueue {
	addRestored(jobs: RestoredJob[]): number;
	hasJournalId(journalId: string): boolean;
}

export interface RestoreResult {
	/** Jobs put back into the queue. */
	restored: number;
	/** Of those, jobs that were running when the process died. */
	interrupted: number;
	/** Jobs given up on (unreadable payload, or too many crashes). */
	dropped: number;
}

export interface QueueJournalOptions {
	/**
	 * Called for every job dropped on restore (including unreadable payloads, so
	 * it receives the raw payload), to fail the service's status.
	 */
	onDropped?: (payload: Record<string, unknown>) => Promise<void> | void;
	/** Cap on how long `add()` waits for the journal write. */
	timeoutMs?: number;
	/** Cap on any single journal write; see WRITE_TIMEOUT_MS. */
	writeTimeoutMs?: number;
}

const EMPTY_RESULT: RestoreResult = { restored: 0, interrupted: 0, dropped: 0 };

const APPLICATION_TYPES = new Set([
	"application",
	"compose",
	"application-preview",
	"compose-preview",
]);

const isRestorableJob = (payload: unknown): payload is DeploymentJob => {
	if (!payload || typeof payload !== "object") return false;
	const job = payload as Record<string, unknown>;
	if (!APPLICATION_TYPES.has(job.applicationType as string)) return false;
	if (job.type !== "deploy" && job.type !== "redeploy") return false;
	const needsCompose =
		job.applicationType === "compose" ||
		job.applicationType === "compose-preview";
	const owner = needsCompose ? job.composeId : job.applicationId;
	return typeof owner === "string" && owner.length > 0;
};

export const createQueueJournal = (
	store: JournalStore,
	options: QueueJournalOptions = {},
) => {
	const timeoutMs = options.timeoutMs ?? ENQUEUE_JOURNAL_TIMEOUT_MS;
	const writeTimeoutMs = options.writeTimeoutMs ?? WRITE_TIMEOUT_MS;
	let chain: Promise<unknown> = Promise.resolve();
	// Ids of jobs enqueued by this process until the restore has read the
	// journal: the restore must not mistake them for leftovers of a previous run.
	let liveIds: Set<string> | null = new Set();
	let restoring: Promise<RestoreResult> | null = null;
	const reported = new Set<string>();

	const fail = (op: string, error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Deployment queue journal: ${op} failed: ${message}`);
		// One report per distinct failure per process: a missing table would
		// otherwise report on every single enqueue.
		const key = `${op}:${message}`;
		if (reported.has(key)) return;
		reported.add(key);
		captureError(error, { handler: "deploymentQueueJournal", op });
	};

	/** Reject if `task` has not settled within the write timeout. */
	const bounded = (op: string, task: () => Promise<unknown>) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(new Error(`${op} write timed out after ${writeTimeoutMs}ms`)),
				writeTimeoutMs,
			);
		});
		return Promise.race([task(), timeout]).finally(() => clearTimeout(timer));
	};

	/**
	 * Run `task` after every earlier journal write. Never rejects, and always
	 * settles within the write timeout so the chain keeps advancing.
	 */
	const run = (op: string, task: () => Promise<unknown>): Promise<void> => {
		const next = chain
			.then(() => bounded(op, task))
			.then(
				() => undefined,
				(error) => fail(op, error),
			);
		chain = next;
		return next;
	};

	const withTimeout = (promise: Promise<void>): Promise<void> => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<void>((resolve) => {
			timer = setTimeout(() => {
				console.error(
					`Deployment queue journal: enqueue write still pending after ${timeoutMs}ms, continuing`,
				);
				resolve();
			}, timeoutMs);
		});
		return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
	};

	const journal: QueueJournal = {
		enqueued: ({ journalId, data }) => {
			liveIds?.add(journalId);
			return withTimeout(
				run("enqueue", () =>
					store.insert(journalId, data as unknown as Record<string, unknown>),
				),
			);
		},
		started: (journalId) => {
			void run("start", () => store.markActive(journalId));
		},
		settled: (journalIds) => {
			void run("settle", () => store.remove(journalIds));
		},
	};

	const doRestore = async (queue: RestorableQueue): Promise<RestoreResult> => {
		// Normally already done by initCancelDeployments (it must precede that
		// sweep); this covers dev, where the sweep does not run.
		await store.markInterrupted();
		const rows = await store.list();

		const seen = liveIds ?? new Set<string>();
		liveIds = null;
		const leftovers = rows.filter(
			(row) => !seen.has(row.jobId) && !queue.hasJournalId(row.jobId),
		);

		const keep: Array<{ row: DeploymentQueueJobRow; data: DeploymentJob }> = [];
		const drop: Array<{ row: DeploymentQueueJobRow; why: string }> = [];
		for (const row of leftovers) {
			if (!isRestorableJob(row.payload)) {
				drop.push({ row, why: "unreadable payload" });
			} else if (
				row.state === "active" &&
				row.attempts + 1 > MAX_REPLAY_ATTEMPTS
			) {
				drop.push({
					row,
					why: `it was running ${MAX_REPLAY_ATTEMPTS} times when Dokploy stopped`,
				});
			} else {
				keep.push({ row, data: row.payload });
			}
		}

		for (const { row, why } of drop) {
			console.error(
				`Deployment queue journal: dropping job ${row.jobId} (${why})`,
			);
			try {
				await options.onDropped?.(
					(row.payload ?? {}) as Record<string, unknown>,
				);
			} catch (error) {
				fail("drop", error);
			}
		}
		if (drop.length > 0) {
			try {
				await store.remove(drop.map(({ row }) => row.jobId));
			} catch (error) {
				fail("drop", error);
			}
		}

		const interruptedIds = keep
			.filter(({ row }) => row.state === "active")
			.map(({ row }) => row.jobId);
		try {
			await store.requeueInterrupted(interruptedIds);
		} catch (error) {
			// The rows stay `active`; the jobs still run, only the attempt count
			// is not advanced.
			fail("requeue", error);
		}

		const restored = queue.addRestored(
			keep.map(({ row, data }) => ({
				journalId: row.jobId,
				data,
				timestamp: row.enqueuedAt.getTime(),
			})),
		);

		return {
			restored,
			interrupted: interruptedIds.length,
			dropped: drop.length,
		};
	};

	return {
		journal,

		/**
		 * Re-enqueue the jobs the previous process left unfinished. Runs once per
		 * process (a second call returns the first call's result) and never
		 * throws: a failure is logged and reported, and startup carries on.
		 */
		restore(queue: RestorableQueue): Promise<RestoreResult> {
			if (!restoring) {
				restoring = doRestore(queue).then(
					(result) => {
						if (result.restored > 0 || result.dropped > 0) {
							console.log(
								`Restored ${result.restored} queued deployment job(s) (${result.interrupted} were running when Dokploy stopped, ${result.dropped} dropped)`,
							);
						}
						return result;
					},
					(error) => {
						liveIds = null;
						fail("restore", error);
						return EMPTY_RESULT;
					},
				);
			}
			return restoring;
		},

		/** Wait for pending journal writes, at most `timeoutMs`. */
		async flush(timeoutMs = 2_000): Promise<void> {
			let timer: ReturnType<typeof setTimeout> | undefined;
			await Promise.race([
				chain,
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, timeoutMs);
				}),
			]);
			clearTimeout(timer);
		},
	};
};
