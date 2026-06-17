import {
	findServerById,
	getAllServers,
	getWebServerSettings,
	IS_CLOUD,
} from "@dokploy/server";
import { type Job, type JobsOptions, type JobType, Queue } from "bullmq";
import {
	CANCEL_CHANNEL,
	deploymentWorker,
	getQueueName,
	getTargetKey,
	LOCAL_TARGET,
} from "./deployments-queue";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

export { LOCAL_TARGET, getTargetKey };

// Pin to globalThis: see deployments-queue.ts QUEUE_STATE_KEY for rationale.
// Without pinning, Next.js loading this module twice produces two `queues`
// Maps + double the Redis connections per target.
const QUEUES_KEY = Symbol.for("dokploy.deploymentQueue.queues");
const queues: Map<string, Queue<DeploymentJob>> = (
	globalThis as { [QUEUES_KEY]?: Map<string, Queue<DeploymentJob>> }
)[QUEUES_KEY] ??
((globalThis as { [QUEUES_KEY]?: Map<string, Queue<DeploymentJob>> })[
	QUEUES_KEY
] = new Map<string, Queue<DeploymentJob>>());

const createNoopQueue = () =>
	({
		getJobs: () => Promise.resolve([] as Job[]),
		getJob: () => Promise.resolve(undefined),
		add: () =>
			Promise.resolve({ id: "noop", remove: () => Promise.resolve() } as Job),
		client: Promise.resolve(undefined as unknown as never),
		close: () => Promise.resolve(),
		on: () => {},
	}) as unknown as Queue<DeploymentJob>;

const getOrCreateQueue = (targetKey: string): Queue<DeploymentJob> => {
	let q = queues.get(targetKey);
	if (q) return q;
	if (IS_CLOUD) {
		q = createNoopQueue();
	} else {
		q = new Queue<DeploymentJob>(getQueueName(targetKey), {
			connection: redisConfig,
		});
		q.on("error", (err) => {
			if ((err as { code?: string })?.code === "ECONNREFUSED") {
				console.error(
					"Make sure you have installed Redis and it is running.",
					err,
				);
			}
		});
	}
	queues.set(targetKey, q);
	return q;
};

const getAllQueues = (): Queue<DeploymentJob>[] => Array.from(queues.values());

const aggregateJobs = async (states?: JobType[]): Promise<Job[]> => {
	const all: Job[] = [];
	for (const q of getAllQueues()) {
		all.push(...((await q.getJobs(states)) as Job[]));
	}
	return all;
};

/**
 * Look up the persisted deploymentConcurrency for a target. Falls back to 1
 * when the row is missing (e.g. a server was deleted between enqueue and
 * worker spin-up). Errors are swallowed — concurrency is a tuning knob, not
 * a correctness boundary.
 */
const resolveConcurrencyForTarget = async (
	targetKey: string,
): Promise<number> => {
	if (IS_CLOUD) return 1;
	try {
		if (targetKey === LOCAL_TARGET) {
			const settings = await getWebServerSettings();
			return settings?.deploymentConcurrency ?? 1;
		}
		const server = await findServerById(targetKey);
		return server?.deploymentConcurrency ?? 1;
	} catch {
		return 1;
	}
};

const ensureWorkerForTarget = async (targetKey: string): Promise<void> => {
	if (IS_CLOUD) return;
	const concurrency = await resolveConcurrencyForTarget(targetKey);
	deploymentWorker.ensureWorker(targetKey, concurrency);
	deploymentWorker.setConcurrency(targetKey, concurrency);
};

/**
 * Legacy facade preserved for webhook callers (pages/api/deploy/*) that still
 * `myQueue.add(...)`. Routes by `serverId` to the correct per-target queue;
 * `getJobs` aggregates across all known per-target queues.
 */
export const myQueue = {
	add: async (name: string, data: DeploymentJob, opts?: JobsOptions) => {
		const targetKey = getTargetKey(data);
		const q = getOrCreateQueue(targetKey);
		await ensureWorkerForTarget(targetKey);
		return q.add(name, data, opts);
	},
	getJobs: (states?: JobType[]) => aggregateJobs(states),
	close: async () => {
		await Promise.all(getAllQueues().map((q) => q.close()));
		queues.clear();
	},
	on: () => {},
} as unknown as Queue<DeploymentJob>;

const publishCancel = async (
	jobId: string,
	targetKey: string,
): Promise<void> => {
	const q = getOrCreateQueue(targetKey);
	const client = await (q as unknown as { client: Promise<unknown> }).client;
	const publisher = client as {
		publish: (channel: string, payload: string) => Promise<unknown>;
	};
	await publisher.publish(CANCEL_CHANNEL, JSON.stringify({ jobId, targetKey }));
};

export const deploymentQueueManager = {
	updateConcurrency: async (
		targetKey: string,
		concurrency: number,
	): Promise<void> => {
		if (IS_CLOUD) return;
		deploymentWorker.setConcurrency(targetKey, concurrency);
	},
	cancel: async (
		jobId: string,
		targetKey: string,
	): Promise<{ canceled: boolean; wasActive: boolean }> => {
		if (IS_CLOUD) return { canceled: false, wasActive: false };
		const q = queues.get(targetKey);
		if (q) {
			const job = await q.getJob(jobId);
			if (job) {
				const state = await job.getState();
				if (state === "waiting" || state === "delayed") {
					await job.remove();
					return { canceled: true, wasActive: false };
				}
			}
		}
		await deploymentWorker.cancelJob(jobId);
		await publishCancel(jobId, targetKey);
		return { canceled: true, wasActive: true };
	},
	/**
	 * Drop the in-process Worker + Queue for `targetKey` (called when a
	 * server is deleted). Cancels any active/pending jobs so cleanup work
	 * stops, then closes and removes the BullMQ handles. Without this the
	 * Worker keeps running forever pointed at an orphaned Redis queue.
	 */
	removeTarget: async (targetKey: string): Promise<void> => {
		if (IS_CLOUD) return;
		if (targetKey === LOCAL_TARGET) return;
		const q = queues.get(targetKey);
		if (q) {
			try {
				const jobs = await q.getJobs([
					"active",
					"waiting",
					"delayed",
					"prioritized",
				]);
				for (const job of jobs) {
					if (!job?.id) continue;
					try {
						await deploymentQueueManager.cancel(job.id, targetKey);
					} catch {}
				}
				await q.close();
			} catch (error) {
				console.error(
					"[deployments] failed to drain queue for removed target",
					targetKey,
					error,
				);
			}
			queues.delete(targetKey);
		}
		try {
			await deploymentWorker.removeWorker(targetKey);
		} catch (error) {
			console.error(
				"[deployments] failed to close worker for removed target",
				targetKey,
				error,
			);
		}
	},
	/**
	 * Pre-warm queues + workers at boot. LOCAL is always warmed. Each server
	 * is also warmed so that any jobs persisted in `deployments:<serverId>`
	 * Redis queues from a previous process get picked up by their target's
	 * worker — without this, per-server queues stay orphaned until the user
	 * triggers a fresh deploy on that server.
	 */
	bootstrap: async (): Promise<void> => {
		if (IS_CLOUD) return;
		getOrCreateQueue(LOCAL_TARGET);
		await ensureWorkerForTarget(LOCAL_TARGET);
		try {
			const servers = await getAllServers();
			for (const s of servers) {
				if (!s?.serverId) continue;
				getOrCreateQueue(s.serverId);
				await ensureWorkerForTarget(s.serverId);
			}
			console.log(
				`Deployment queue ready (LOCAL + ${servers.length} server queue(s))`,
			);
		} catch (error) {
			console.error("Failed to pre-warm per-server deployment workers", error);
		}
	},
};

export const cleanQueuesByApplication = async (applicationId: string) => {
	const jobs = await aggregateJobs(["waiting", "delayed"]);
	for (const job of jobs) {
		if (job?.data?.applicationId === applicationId) {
			await job.remove();
		}
	}
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const jobs = await aggregateJobs(["waiting", "delayed"]);
	for (const job of jobs) {
		if (job?.data?.composeId === composeId) {
			await job.remove();
		}
	}
};

/**
 * Self-hosted cancel: abort any in-flight job for this application AND drop
 * pending ones. The worker's abort listener tears down only this job's
 * process group (LOCAL) or SSH session (REMOTE), so concurrent builds for
 * other resources on the same host are untouched.
 */
export const cancelDeploymentsByApplication = async (applicationId: string) => {
	const jobs = await aggregateJobs([
		"active",
		"waiting",
		"delayed",
		"prioritized",
	]);
	let canceled = 0;
	for (const job of jobs) {
		if (job?.data?.applicationId !== applicationId) continue;
		if (!job.id) continue;
		const targetKey = getTargetKey(job.data);
		await deploymentQueueManager.cancel(job.id, targetKey);
		canceled++;
	}
	return canceled;
};

export const cancelDeploymentsByCompose = async (composeId: string) => {
	const jobs = await aggregateJobs([
		"active",
		"waiting",
		"delayed",
		"prioritized",
	]);
	let canceled = 0;
	for (const job of jobs) {
		if (job?.data?.composeId !== composeId) continue;
		if (!job.id) continue;
		const targetKey = getTargetKey(job.data);
		await deploymentQueueManager.cancel(job.id, targetKey);
		canceled++;
	}
	return canceled;
};

export const cleanAllDeploymentQueue = async () => {
	await deploymentWorker.cancelAllJobs("User requested cancellation");
	for (const q of getAllQueues()) {
		const jobs = await q.getJobs(["waiting", "delayed"]);
		for (const job of jobs) await job.remove();
	}
	return true;
};
