import {
	cancelAllQueuedDeployments,
	createDeployment,
	createDeploymentCompose,
	createDeploymentPreview,
	IS_CLOUD,
	updateApplicationStatus,
	updateCompose,
	updateDeploymentStatus,
	updatePreviewDeployment,
} from "@dokploy/server";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { resolveBuildsConcurrency } from "./concurrency";
import { processDeploymentJob } from "./deployments-queue";
import { type InMemoryJob, InMemoryQueue } from "./in-memory-queue";
import type { DeploymentJob } from "./queue-types";
import { withServiceLock } from "./service-lock";

/**
 * Deployment queue.
 *
 * Self-hosted uses an in-memory, per-group FIFO queue with configurable
 * concurrency per server. Cloud does not use the queue at all — deployments
 * run directly in the background — so we expose a no-op.
 */

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
}

const createNoopQueue = (): DeploymentQueue => ({
	add: () => Promise.resolve({ id: "noop" }),
	getJobs: () => Promise.resolve([]),
	close: () => Promise.resolve(),
	on: () => {},
	run: () => Promise.resolve(),
	removeWaiting: () => 0,
	clearWaiting: () => 0,
});

const createInMemoryQueue = (): DeploymentQueue => {
	const queue = new InMemoryQueue({
		resolveConcurrency: resolveBuildsConcurrency,
	});
	queue.process(processDeploymentJob);

	return {
		add: (_name, data) => queue.add(data),
		getJobs: (states) => queue.getJobs(states),
		close: () => queue.close(),
		on: () => {},
		run: () => queue.run(),
		removeWaiting: (predicate) => queue.removeWaiting(predicate),
		clearWaiting: () => queue.clearWaiting(),
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

export const getJobsByApplicationId = async (applicationId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter(
		(job) =>
			job.data.applicationType === "application" &&
			job.data.applicationId === applicationId,
	);
};

export const getJobsByComposeId = async (composeId: string) => {
	const jobs = await myQueue.getJobs();
	return jobs.filter(
		(job) =>
			job.data.applicationType === "compose" &&
			job.data.composeId === composeId,
	);
};

if (!IS_CLOUD) {
	process.on("SIGTERM", () => {
		myQueue.close();
		process.exit(0);
	});
}

export const cleanQueuesByApplication = async (applicationId: string) => {
	return withServiceLock(`application:${applicationId}`, async () => {
		await cancelAllQueuedDeployments("applicationId", applicationId);
		const removed = myQueue.removeWaiting(
			(data) =>
				data.applicationType === "application" &&
				data.applicationId === applicationId,
		);
		if (removed > 0) {
			console.log(
				`Removed ${removed} waiting job(s) for application ${applicationId}`,
			);
		}
	});
};

export const cleanQueuesByCompose = async (composeId: string) => {
	return withServiceLock(`compose:${composeId}`, async () => {
		await cancelAllQueuedDeployments("composeId", composeId);
		const removed = myQueue.removeWaiting(
			(data) =>
				data.applicationType === "compose" && data.composeId === composeId,
		);
		if (removed > 0) {
			console.log(`Removed ${removed} waiting job(s) for compose ${composeId}`);
		}
	});
};

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

const enqueueDeployment = async (
	jobData: DeploymentJob,
	createRecord: () => Promise<{ deploymentId: string }>,
	resetStatus: () => Promise<unknown>,
) => {
	try {
		const deployment = await createRecord();
		jobData.deploymentId = deployment.deploymentId;
		return myQueue.add(
			"deployments",
			{ ...jobData },
			{ removeOnComplete: true, removeOnFail: true },
		);
	} catch (error) {
		if (jobData.deploymentId) {
			await updateDeploymentStatus(jobData.deploymentId, "cancelled").catch(
				console.error,
			);
		}
		await resetStatus().catch(console.error);
		throw error;
	}
};

export const enqueueApplicationDeployment = async (jobData: DeploymentJob) => {
	if (jobData.applicationType !== "application") return;
	return withServiceLock(`application:${jobData.applicationId}`, async () => {
		await updateApplicationStatus(jobData.applicationId, "queued");
		return enqueueDeployment(
			jobData,
			() =>
				createDeployment({
					applicationId: jobData.applicationId,
					title: jobData.titleLog,
					description: jobData.descriptionLog,
					status: "queued",
				}),
			() => updateApplicationStatus(jobData.applicationId, "idle"),
		);
	});
};

export const enqueueComposeDeployment = async (jobData: DeploymentJob) => {
	if (jobData.applicationType !== "compose") return;
	return withServiceLock(`compose:${jobData.composeId}`, async () => {
		await updateCompose(jobData.composeId, { composeStatus: "queued" });
		return enqueueDeployment(
			jobData,
			() =>
				createDeploymentCompose({
					composeId: jobData.composeId,
					title: jobData.titleLog,
					description: jobData.descriptionLog,
					status: "queued",
				}),
			() => updateCompose(jobData.composeId, { composeStatus: "idle" }),
		);
	});
};

export const enqueuePreviewDeployment = async (jobData: DeploymentJob) => {
	if (jobData.applicationType !== "application-preview") return;
	return withServiceLock(`preview:${jobData.previewDeploymentId}`, async () => {
		await updatePreviewDeployment(jobData.previewDeploymentId, {
			previewStatus: "queued",
		});
		return enqueueDeployment(
			jobData,
			() =>
				createDeploymentPreview({
					previewDeploymentId: jobData.previewDeploymentId,
					title: jobData.titleLog,
					description: jobData.descriptionLog,
					status: "queued",
				}),
			() =>
				updatePreviewDeployment(jobData.previewDeploymentId, {
					previewStatus: "idle",
				}),
		);
	});
};

export { myQueue };
