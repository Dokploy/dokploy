import {
	IS_CLOUD,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import { isCoalescableDeployJob } from "@dokploy/server/services/build-policy/coalesce";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { resolveBuildsConcurrency } from "./concurrency";
import { processDeploymentJob } from "./deployments-queue";
import { type InMemoryJob, InMemoryQueue } from "./in-memory-queue";
import {
	createQueueJournal,
	dbJournalStore,
	type RestoreResult,
} from "./queue-journal";
import type { DeploymentJob } from "./queue-types";

/**
 * Deployment queue.
 *
 * Self-hosted uses an in-memory, per-group FIFO queue with configurable
 * concurrency per server. Cloud does not use the queue at all — deployments
 * run directly in the background — so we expose a no-op.
 *
 * The in-memory queue is the executor; every job is also journaled in Postgres
 * (table `deployment_queue_job`, see queue-journal.ts) so a restart of the
 * Dokploy service re-enqueues what was waiting or running instead of silently
 * dropping it. Remote-server jobs (`serverId`) share the same queue and journal.
 */

/** How long a SIGTERM waits for running jobs before exiting (swarm stops at 10s). */
const SHUTDOWN_GRACE_MS = 8_000;

interface DeploymentQueue {
	add: (
		name: string,
		data: DeploymentJob,
		opts?: Record<string, unknown>,
	) => Promise<{ id: string }>;
	getJobs: (states?: Array<"waiting" | "active">) => Promise<InMemoryJob[]>;
	close: () => Promise<void>;
	on: (...args: unknown[]) => void;
	run: () => Promise<void>;
	removeWaiting: (predicate: (data: DeploymentJob) => boolean) => number;
	clearWaiting: () => number;
	/** Re-enqueue the jobs the previous process left unfinished. Never throws. */
	restore: () => Promise<RestoreResult>;
	/** Stop taking jobs, give running ones `graceMs` to finish, flush the journal. */
	shutdown: (graceMs: number) => Promise<void>;
}

const createNoopQueue = (): DeploymentQueue => ({
	add: () => Promise.resolve({ id: "noop" }),
	getJobs: () => Promise.resolve([]),
	close: () => Promise.resolve(),
	on: () => {},
	run: () => Promise.resolve(),
	removeWaiting: () => 0,
	clearWaiting: () => 0,
	restore: () => Promise.resolve({ restored: 0, interrupted: 0, dropped: 0 }),
	shutdown: () => Promise.resolve(),
});

/** A dropped job must not leave its service showing "running". */
const failDroppedJob = async (data: DeploymentJob) => {
	if (data.applicationType === "application") {
		await updateApplicationStatus(data.applicationId, "error");
	} else if (data.applicationType === "compose") {
		await updateCompose(data.composeId, { composeStatus: "error" });
	} else {
		await updatePreviewDeployment(data.previewDeploymentId, {
			previewStatus: "error",
		});
	}
};

const createInMemoryQueue = (): DeploymentQueue => {
	const durable = createQueueJournal(dbJournalStore, {
		onDropped: failDroppedJob,
	});
	const queue = new InMemoryQueue({
		resolveConcurrency: resolveBuildsConcurrency,
		journal: durable.journal,
	});
	queue.process(processDeploymentJob);

	let shuttingDown: Promise<void> | null = null;

	return {
		add: (_name, data) => queue.add(data),
		getJobs: (states) => queue.getJobs(states),
		close: () => queue.close(),
		on: () => {},
		run: () => queue.run(),
		removeWaiting: (predicate) => queue.removeWaiting(predicate),
		clearWaiting: () => queue.clearWaiting(),
		restore: () => durable.restore(queue),
		shutdown: (graceMs) => {
			shuttingDown ??= (async () => {
				// Nothing new starts; anything still running when the grace period
				// ends stays in the journal as `active` and is re-run on the next boot.
				await queue.close();
				await queue.waitForIdle(graceMs);
				await durable.flush();
			})();
			return shuttingDown;
		},
	};
};

// Use a global singleton so the deployment queue is shared across every module
// instance. In dev (tsx/Next) the same file can be evaluated more than once
// (relative import in server.ts vs `@/` alias in the routers); without this the
// worker and the `add()` calls would land on different queue instances.
const globalForQueue = globalThis as unknown as {
	__dokployDeploymentQueue?: DeploymentQueue;
};

if (!globalForQueue.__dokployDeploymentQueue) {
	globalForQueue.__dokployDeploymentQueue = !IS_CLOUD
		? createInMemoryQueue()
		: createNoopQueue();
}

const myQueue: DeploymentQueue = globalForQueue.__dokployDeploymentQueue;

/** Start processing jobs. Called once on server startup (self-hosted). */
export const startDeploymentWorker = () => myQueue.run();

/**
 * Re-enqueue the jobs the previous process left unfinished (self-hosted).
 * Called once on startup after the worker is running; safe to call again.
 */
export const restoreQueuedDeployments = () => myQueue.restore();

export const getJobsByApplicationId = async (applicationId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter(
		(job) => (job.data as any)?.applicationId === applicationId,
	);
};

export const getJobsByComposeId = async (composeId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter((job) => (job.data as any)?.composeId === composeId);
};

if (!IS_CLOUD) {
	process.on("SIGTERM", () => {
		// The journal is the real guarantee: whatever is still running when the
		// grace period ends is re-run on the next boot.
		void myQueue
			.shutdown(SHUTDOWN_GRACE_MS)
			.catch((error) => console.error("Queue shutdown failed", error))
			.finally(() => process.exit(0));
	});
}

// build-policy hook: these two now return how many waiting jobs they dropped,
// so the enqueue-time coalescing gate can audit it. Existing callers ignore the
// returned value. See packages/server/src/services/build-policy/README.md.
export const cleanQueuesByApplication = async (applicationId: string) => {
	const removed = myQueue.removeWaiting(
		(data) => (data as any)?.applicationId === applicationId,
	);
	if (removed > 0) {
		console.log(
			`Removed ${removed} waiting job(s) for application ${applicationId}`,
		);
	}
	return removed;
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const removed = myQueue.removeWaiting(
		(data) => (data as any)?.composeId === composeId,
	);
	if (removed > 0) {
		console.log(`Removed ${removed} waiting job(s) for compose ${composeId}`);
	}
	return removed;
};

/**
 * build-policy hook: coalescing siblings of the two helpers above.
 *
 * The originals back explicit "clean queues" actions, where dropping every
 * waiting job for a unit — previews included — is the intent. Coalescing runs
 * automatically on every push, so it must drop ONLY the unit's own plain
 * deploys: a queued PR preview for the same application is a different job that
 * nobody asked to cancel.
 *
 * Both return the titles of what they dropped, so the audit entry names it.
 */
const coalesceWaiting = (
	matches: (data: any) => boolean,
): { removed: number; titles: string[] } => {
	const titles: string[] = [];
	const removed = myQueue.removeWaiting((data) => {
		if (!matches(data)) return false;
		const title = (data as any)?.titleLog;
		if (typeof title === "string") titles.push(title);
		return true;
	});
	return { removed, titles };
};

export const coalesceQueuedApplicationDeploys = async (applicationId: string) =>
	coalesceWaiting((data) =>
		isCoalescableDeployJob("application", applicationId, data),
	);

export const coalesceQueuedComposeDeploys = async (composeId: string) =>
	coalesceWaiting((data) => isCoalescableDeployJob("compose", composeId, data));

export const cleanAllDeploymentQueue = async () => {
	myQueue.clearWaiting();
	return true;
};

export const killDockerBuild = async (
	type: "application" | "compose",
	serverId: string | null,
) => {
	try {
		if (type === "application") {
			const command = `pkill -2 -f "docker build"`;

			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		} else if (type === "compose") {
			const command = `pkill -2 -f "docker compose"`;

			if (serverId) {
				await execAsyncRemote(serverId, command);
			} else {
				await execAsync(command);
			}
		}
	} catch (error) {
		console.error(error);
	}
};

export { myQueue };
