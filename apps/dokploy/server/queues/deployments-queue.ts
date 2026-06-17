import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	IS_CLOUD,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import {
	dokployJobContext,
	killJobProcesses,
} from "@dokploy/server/utils/process/job-context";
import { type Job, Worker } from "bullmq";
import {
	CANCEL_CHANNEL,
	getQueueName,
	getTargetKey,
	LOCAL_TARGET,
} from "./queue-routing";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

export { CANCEL_CHANNEL, getQueueName, getTargetKey, LOCAL_TARGET };

const MAX_CONCURRENCY = 10;
const DEFAULT_CONCURRENCY = 1;

const clampConcurrency = (n: number): number =>
	Math.max(1, Math.min(Math.floor(n) || DEFAULT_CONCURRENCY, MAX_CONCURRENCY));

// Pin queue runtime state to globalThis. Without this, Next.js loading this
// module from both the workspace package and its own runtime produces two
// `workers` Maps, each spinning up its own BullMQ Worker for the same queue.
// Effective concurrency then becomes (concurrency × moduleCopies), and cancel
// can target a job tracked in the other copy's `inflight`. Same reasoning as
// `job-context.ts`'s child-registry pinning.
const QUEUE_STATE_KEY = Symbol.for("dokploy.deploymentQueue.state");
type QueueState = {
	workers: Map<string, Worker<DeploymentJob>>;
	inflight: Map<string, AbortController>;
	cancelSubscriber: { quit: () => Promise<unknown> } | null;
	started: boolean;
};
type GlobalShared = typeof globalThis & {
	[QUEUE_STATE_KEY]?: QueueState;
};
const g = globalThis as GlobalShared;
const queueState: QueueState =
	g[QUEUE_STATE_KEY] ??
	(g[QUEUE_STATE_KEY] = {
		workers: new Map<string, Worker<DeploymentJob>>(),
		inflight: new Map<string, AbortController>(),
		cancelSubscriber: null,
		started: false,
	});
const workers = queueState.workers;
const inflight = queueState.inflight;

const killJobOnAbort = (jobId: string): void => {
	if (!jobId) return;
	try {
		killJobProcesses(jobId);
	} catch (error) {
		console.error("[deployments] failed to kill job", jobId, error);
	}
};

const handleJob = async (
	job: Job<DeploymentJob>,
	signal: AbortSignal,
): Promise<void> => {
	const data = job.data;
	const jobId = job.id ?? "";
	const serverId = data.serverId ?? null;

	// On abort, kill *only* this job's process tree — never a global
	// `pkill -f "docker build"` (which would kill unrelated concurrent
	// builds on the same host).
	const onAbort = () => {
		killJobOnAbort(jobId);
	};
	signal.addEventListener("abort", onAbort, { once: true });

	try {
		await dokployJobContext.run({ jobId, serverId }, async () => {
			if (data.applicationType === "application") {
				await updateApplicationStatus(data.applicationId, "running");
				if (data.type === "redeploy") {
					await rebuildApplication({
						applicationId: data.applicationId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
					});
				} else if (data.type === "deploy") {
					await deployApplication({
						applicationId: data.applicationId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
					});
				}
			} else if (data.applicationType === "compose") {
				await updateCompose(data.composeId, { composeStatus: "running" });
				if (data.type === "deploy") {
					await deployCompose({
						composeId: data.composeId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
					});
				} else if (data.type === "redeploy") {
					await rebuildCompose({
						composeId: data.composeId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
					});
				}
			} else if (data.applicationType === "application-preview") {
				await updatePreviewDeployment(data.previewDeploymentId, {
					previewStatus: "running",
				});
				if (data.type === "redeploy") {
					await rebuildPreviewApplication({
						applicationId: data.applicationId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
						previewDeploymentId: data.previewDeploymentId,
					});
				} else if (data.type === "deploy") {
					await deployPreviewApplication({
						applicationId: data.applicationId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
						previewDeploymentId: data.previewDeploymentId,
					});
				}
			}
		});
	} catch (error) {
		if (signal.aborted) {
			try {
				if (data.applicationType === "application") {
					await updateApplicationStatus(data.applicationId, "error");
				} else if (data.applicationType === "compose") {
					await updateCompose(data.composeId, { composeStatus: "error" });
				} else if (data.applicationType === "application-preview") {
					await updatePreviewDeployment(data.previewDeploymentId, {
						previewStatus: "error",
					});
				}
			} catch {}
			throw new Error("Deployment aborted by user");
		}
		throw error;
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
	if (signal.aborted) {
		throw new Error("Deployment aborted by user");
	}
};

const createWorker = (
	targetKey: string,
	concurrency: number,
): Worker<DeploymentJob> => {
	const worker = new Worker<DeploymentJob>(
		getQueueName(targetKey),
		async (job) => {
			const ac = new AbortController();
			const key = job.id ?? `${job.queueQualifiedName}:${job.timestamp}`;
			inflight.set(key, ac);
			try {
				await handleJob(job, ac.signal);
			} finally {
				inflight.delete(key);
			}
		},
		{
			autorun: false,
			concurrency: clampConcurrency(concurrency),
			connection: redisConfig,
		},
	);
	worker.on("error", (err) => {
		if ((err as { code?: string })?.code === "ECONNREFUSED") {
			console.error(
				"Make sure you have installed Redis and it is running.",
				err,
			);
		}
	});
	workers.set(targetKey, worker);
	return worker;
};

/**
 * BullMQ's `Worker.run()` only resolves when the worker is closed (it awaits
 * the internal main loop). We can't `await` it during boot or every subsequent
 * step (bootstrap, shutdown handlers) hangs forever. Fire-and-forget here.
 */
const startIfStopped = (w: Worker<DeploymentJob>): void => {
	const running = (w as { isRunning?: () => boolean }).isRunning?.();
	if (running) return;
	void w.run().catch((err) => {
		console.error("[deployments] worker.run() error", err);
	});
};

const ensureWorker = (
	targetKey: string,
	concurrency: number = DEFAULT_CONCURRENCY,
): Worker<DeploymentJob> => {
	const existing = workers.get(targetKey);
	if (existing) return existing;
	const worker = createWorker(targetKey, concurrency);
	if (queueState.started) startIfStopped(worker);
	return worker;
};

const startCancelSubscriber = async (): Promise<void> => {
	if (queueState.cancelSubscriber) return;
	const seedWorker = workers.get(LOCAL_TARGET) ?? createWorker(LOCAL_TARGET, 1);
	const client = await seedWorker.client;
	const sub = (
		client as unknown as { duplicate: () => unknown }
	).duplicate() as {
		subscribe: (channel: string) => Promise<unknown>;
		on: (
			event: "message",
			cb: (channel: string, payload: string) => void,
		) => void;
		quit: () => Promise<unknown>;
	};
	await sub.subscribe(CANCEL_CHANNEL);
	sub.on("message", (_chan, payload) => {
		try {
			const { jobId } = JSON.parse(payload) as { jobId: string };
			const ac = inflight.get(jobId);
			if (ac) ac.abort();
		} catch (err) {
			console.error("Cancel subscriber: bad payload", err);
		}
	});
	queueState.cancelSubscriber = sub;
};

const realDeploymentWorker = {
	run: async (): Promise<void> => {
		queueState.started = true;
		ensureWorker(LOCAL_TARGET);
		for (const w of workers.values()) startIfStopped(w);
		void startCancelSubscriber().catch((err) => {
			console.error("[deployments] cancel subscriber failed to start", err);
		});
	},
	close: async (_reason?: string): Promise<void> => {
		queueState.started = false;
		// Stop pulling new jobs and drain in-flight ones gracefully. BullMQ's
		// `worker.close()` waits for active handlers to resolve. We deliberately
		// do NOT call `ac.abort()` here — that would kill every running deploy
		// on a routine Dokploy upgrade (swarm rolling restart sends SIGTERM,
		// which calls this path). If the orchestrator follows up with SIGKILL
		// after its grace period, the OS handles termination; the spawned
		// builds run with `detached:true` so they have their own process group
		// and can complete on the host even if our process is gone.
		await Promise.all(Array.from(workers.values()).map((w) => w.close()));
		workers.clear();
		if (queueState.cancelSubscriber) {
			await queueState.cancelSubscriber.quit().catch(() => {});
			queueState.cancelSubscriber = null;
		}
	},
	cancelJob: async (jobId: string, _reason?: string): Promise<void> => {
		const ac = inflight.get(jobId);
		if (ac) ac.abort();
	},
	cancelAllJobs: async (_reason?: string): Promise<void> => {
		for (const ac of inflight.values()) ac.abort();
	},
	/**
	 * Live-update a worker's concurrency. The new value applies to the next
	 * job-fetch decision: BullMQ honours `worker.concurrency` mutation on its
	 * main loop, so raising the limit lets queued jobs become active
	 * immediately, and lowering it stops new fetches until in-flight jobs
	 * drain. **In-flight jobs are NOT interrupted** by this call — they keep
	 * running to completion. To stop a running job, use `cancelJob`.
	 */
	setConcurrency: (targetKey: string, concurrency: number): void => {
		const safe = clampConcurrency(concurrency);
		const worker = ensureWorker(targetKey, safe);
		worker.concurrency = safe;
	},
	ensureWorker: (
		targetKey: string,
		concurrency: number = DEFAULT_CONCURRENCY,
	): void => {
		ensureWorker(targetKey, concurrency);
	},
	removeWorker: async (targetKey: string): Promise<void> => {
		const w = workers.get(targetKey);
		if (!w) return;
		workers.delete(targetKey);
		try {
			await w.close();
		} catch (err) {
			console.error("[deployments] worker.close error", targetKey, err);
		}
	},
	hasInflight: (jobId: string): boolean => inflight.has(jobId),
};

const noopDeploymentWorker = {
	run: () => Promise.resolve(),
	close: (_reason?: string) => Promise.resolve(),
	cancelJob: (_jobId: string, _reason?: string) => Promise.resolve(),
	cancelAllJobs: (_reason?: string) => Promise.resolve(),
	setConcurrency: (_targetKey: string, _concurrency: number) => {},
	ensureWorker: (_targetKey: string, _concurrency?: number) => {},
	removeWorker: (_targetKey: string) => Promise.resolve(),
	hasInflight: (_jobId: string) => false,
};

export const deploymentWorker = !IS_CLOUD
	? realDeploymentWorker
	: noopDeploymentWorker;
