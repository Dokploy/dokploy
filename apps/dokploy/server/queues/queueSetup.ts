import {
	findApplicationById,
	findComposeById,
	findServerById,
	getAllServers,
	getWebServerSettings,
	IS_CLOUD,
} from "@dokploy/server";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { createDeploymentWorker } from "./deployments-queue";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

const MAX_DEPLOYMENT_CONCURRENCY = 5;
const LOCAL_TARGET_ID = "local";
const LOCAL_TARGET_NAME = "Local Dokploy Host";
const LOCAL_QUEUE_NAME = "deployments:local";

type QueueTargetType = "local" | "server";
type QueueStates = Parameters<Queue<DeploymentJob>["getJobs"]>[0];

type QueueTarget = {
	type: QueueTargetType;
	id: string;
	name: string;
	queueName: string;
};

export type QueueSummary = {
	targetType: QueueTargetType;
	targetId: string;
	targetName: string;
	concurrencyLimit: number;
	runningOnTarget: number;
	queuedForService: number;
	queuedOnTarget: number;
	nextServiceJobPosition: number | null;
};

const queueRegistry = new Map<string, Queue<DeploymentJob>>();
const workerRegistry = new Map<string, ReturnType<typeof createDeploymentWorker>>();
const refreshRegistry = new Map<string, Promise<void>>();

let hasProcessListeners = false;

const clampConcurrency = (value: number | null | undefined) => {
	const candidate = Number.isFinite(value) ? Number(value) : 1;
	return Math.min(MAX_DEPLOYMENT_CONCURRENCY, Math.max(1, Math.trunc(candidate)));
};

const buildQueueName = (target: QueueTarget) =>
	target.type === "local"
		? LOCAL_QUEUE_NAME
		: `deployments:server:${target.id}`;

const buildLocalTarget = (): QueueTarget => ({
	type: "local",
	id: LOCAL_TARGET_ID,
	name: LOCAL_TARGET_NAME,
	queueName: LOCAL_QUEUE_NAME,
});

const buildServerTarget = async (serverId: string): Promise<QueueTarget> => {
	const server = await findServerById(serverId);
	return {
		type: "server",
		id: server.serverId,
		name: server.name,
		queueName: buildQueueName({
			type: "server",
			id: server.serverId,
			name: server.name,
			queueName: "",
		}),
	};
};

const getQueue = (queueName: string) => {
	const cached = queueRegistry.get(queueName);
	if (cached) {
		return cached;
	}

	const queue = new Queue<DeploymentJob>(queueName, { connection: redisConfig });
	queue.on("error", (error) => {
		if ((error as any).code === "ECONNREFUSED") {
			console.error(
				"Make sure you have installed Redis and it is running.",
				error,
			);
		}
	});

	queueRegistry.set(queueName, queue);
	return queue;
};

const getTargetConcurrency = async (target: QueueTarget): Promise<number> => {
	if (target.type === "local") {
		const settings = await getWebServerSettings();
		return clampConcurrency(settings?.localDeploymentConcurrency);
	}

	const server = await findServerById(target.id);
	return clampConcurrency(server.deploymentConcurrency);
};

const startWorkerForTarget = async (target: QueueTarget) => {
	const currentWorker = workerRegistry.get(target.queueName);
	if (currentWorker) {
		return currentWorker;
	}

	getQueue(target.queueName);
	const concurrency = await getTargetConcurrency(target);
	const worker = createDeploymentWorker(target.queueName, concurrency);
	worker.on("error", (error) => {
		console.error(
			`Deployment worker error on queue "${target.queueName}":`,
			error,
		);
	});
	void worker.run().catch((error) => {
		console.error(
			`Deployment worker stopped on queue "${target.queueName}":`,
			error,
		);
	});
	workerRegistry.set(target.queueName, worker);

	return worker;
};

const closeWorkerByQueueName = async (queueName: string) => {
	const worker = workerRegistry.get(queueName);
	if (!worker) {
		return;
	}
	await worker.close();
	workerRegistry.delete(queueName);
};

const withRefreshLock = async (queueName: string, task: () => Promise<void>) => {
	const running = refreshRegistry.get(queueName);
	if (running) {
		await running;
		return;
	}

	const refreshPromise = task().finally(() => {
		refreshRegistry.delete(queueName);
	});
	refreshRegistry.set(queueName, refreshPromise);
	await refreshPromise;
};

const resolveTargetFromDeploymentJob = async (
	jobData: DeploymentJob,
): Promise<QueueTarget> => {
	if (jobData.applicationType === "application") {
		const application = await findApplicationById(jobData.applicationId);
		const serverId = application.buildServerId || application.serverId;
		return serverId ? buildServerTarget(serverId) : buildLocalTarget();
	}

	if (jobData.applicationType === "compose") {
		const compose = await findComposeById(jobData.composeId);
		return compose.serverId ? buildServerTarget(compose.serverId) : buildLocalTarget();
	}

	const application = await findApplicationById(jobData.applicationId);
	return application.serverId
		? buildServerTarget(application.serverId)
		: buildLocalTarget();
};

const resolveTargetFromService = async (
	type: "application" | "compose",
	id: string,
): Promise<QueueTarget> => {
	if (type === "application") {
		const application = await findApplicationById(id);
		const serverId = application.buildServerId || application.serverId;
		return serverId ? buildServerTarget(serverId) : buildLocalTarget();
	}

	const compose = await findComposeById(id);
	return compose.serverId ? buildServerTarget(compose.serverId) : buildLocalTarget();
};

const getKnownTargets = async (): Promise<QueueTarget[]> => {
	const targets: QueueTarget[] = [buildLocalTarget()];
	const servers = await getAllServers();
	for (const server of servers) {
		targets.push({
			type: "server",
			id: server.serverId,
			name: server.name,
			queueName: buildQueueName({
				type: "server",
				id: server.serverId,
				name: server.name,
				queueName: "",
			}),
		});
	}
	return targets;
};

const getJobsFromQueues = async (
	targets: QueueTarget[],
	states?: QueueStates,
) => {
	const entries = await Promise.all(
		targets.map(async (target) => {
			const queue = getQueue(target.queueName);
			const jobs = await queue.getJobs(states);
			return jobs;
		}),
	);

	return entries.flat();
};

const removeQueuedJobs = async (matcher: (job: Job<DeploymentJob>) => boolean) => {
	if (IS_CLOUD) {
		return;
	}

	const targets = await getKnownTargets();
	const jobs = await getJobsFromQueues(targets, ["waiting", "delayed"]);
	for (const job of jobs) {
		if (matcher(job)) {
			await job.remove();
		}
	}
};

const ensureProcessListeners = () => {
	if (IS_CLOUD || hasProcessListeners) {
		return;
	}

	hasProcessListeners = true;
	process.on("SIGTERM", () => {
		void closeAllQueuesAndWorkers().finally(() => {
			process.exit(0);
		});
	});
};

const closeAllQueuesAndWorkers = async () => {
	await Promise.all(
		[...workerRegistry.values()].map(async (worker) => {
			await worker.close();
		}),
	);
	workerRegistry.clear();

	await Promise.all(
		[...queueRegistry.values()].map(async (queue) => {
			await queue.close();
		}),
	);
	queueRegistry.clear();
};

export const startDeploymentWorkers = async () => {
	if (IS_CLOUD) {
		return;
	}

	ensureProcessListeners();
	await startWorkerForTarget(buildLocalTarget());
	const targets = await getKnownTargets();
	for (const target of targets) {
		if (target.type === "server") {
			await startWorkerForTarget(target);
		}
	}
};

export const enqueueDeploymentJob = async (
	jobData: DeploymentJob,
	options?: Parameters<Queue<DeploymentJob>["add"]>[2],
) => {
	if (IS_CLOUD) {
		return {
			id: "noop",
			remove: async () => undefined,
		} as unknown as Job<DeploymentJob>;
	}

	const target = await resolveTargetFromDeploymentJob(jobData);
	await startWorkerForTarget(target);
	const queue = getQueue(target.queueName);
	return queue.add("deployments", { ...jobData }, options);
};

export const getJobsByApplicationId = async (applicationId: string) => {
	if (IS_CLOUD) {
		return [] as Job<DeploymentJob>[];
	}

	const targets = await getKnownTargets();
	const jobs = await getJobsFromQueues(targets, ["waiting", "delayed"]);
	return jobs.filter((job) => {
		const data = job?.data;
		return (
			data?.applicationType === "application" ||
			data?.applicationType === "application-preview"
		)
			? data.applicationId === applicationId
			: false;
	});
};

export const getJobsByComposeId = async (composeId: string) => {
	if (IS_CLOUD) {
		return [] as Job<DeploymentJob>[];
	}

	const targets = await getKnownTargets();
	const jobs = await getJobsFromQueues(targets, ["waiting", "delayed"]);
	return jobs.filter((job) =>
		job?.data?.applicationType === "compose"
			? job.data.composeId === composeId
			: false,
	);
};

export const cleanQueuesByApplication = async (applicationId: string) => {
	await removeQueuedJobs((job) => {
		const data = job?.data;
		return (
			data?.applicationType === "application" ||
			data?.applicationType === "application-preview"
		)
			? data.applicationId === applicationId
			: false;
	});
};

export const cleanQueuesByCompose = async (composeId: string) => {
	await removeQueuedJobs((job) =>
		job?.data?.applicationType === "compose"
			? job.data.composeId === composeId
			: false,
	);
};

export const cleanAllDeploymentQueue = async () => {
	await removeQueuedJobs(() => true);
	return true;
};

export const refreshLocalDeploymentWorker = async () => {
	if (IS_CLOUD) {
		return;
	}
	const target = buildLocalTarget();
	await withRefreshLock(target.queueName, async () => {
		await closeWorkerByQueueName(target.queueName);
		await startWorkerForTarget(target);
	});
};

export const refreshServerDeploymentWorker = async (serverId: string) => {
	if (IS_CLOUD) {
		return;
	}
	const target = await buildServerTarget(serverId);
	await withRefreshLock(target.queueName, async () => {
		await closeWorkerByQueueName(target.queueName);
		await startWorkerForTarget(target);
	});
};

export const getQueueSummaryByType = async (
	type: "application" | "compose",
	id: string,
): Promise<QueueSummary> => {
	const target = await resolveTargetFromService(type, id);
	const queue = getQueue(target.queueName);
	const [queuedJobs, runningJobs, concurrency] = await Promise.all([
		queue.getJobs(["waiting", "delayed"]),
		queue.getJobs(["active"]),
		getTargetConcurrency(target),
	]);

	const isServiceJob = (job: Job<DeploymentJob>) => {
		if (type === "application") {
			return (
				job.data.applicationType === "application" && job.data.applicationId === id
			);
		}

		return job.data.applicationType === "compose" && job.data.composeId === id;
	};

	const queuedForService = queuedJobs.filter(isServiceJob);
	const nextServiceJobPosition = (() => {
		const index = queuedJobs.findIndex(isServiceJob);
		return index === -1 ? null : index + 1;
	})();

	return {
		targetType: target.type,
		targetId: target.id,
		targetName: target.name,
		concurrencyLimit: concurrency,
		runningOnTarget: runningJobs.length,
		queuedForService: queuedForService.length,
		queuedOnTarget: queuedJobs.length,
		nextServiceJobPosition,
	};
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

export const myQueue = {
	add: async (
		_name: string,
		jobData: DeploymentJob,
		options?: Parameters<Queue<DeploymentJob>["add"]>[2],
	) => enqueueDeploymentJob(jobData, options),
	getJobs: async (states?: QueueStates) => {
		if (IS_CLOUD) {
			return [] as Job<DeploymentJob>[];
		}
		const targets = await getKnownTargets();
		return getJobsFromQueues(targets, states);
	},
	close: async () => {
		await closeAllQueuesAndWorkers();
	},
	on: () => {},
} as unknown as Queue<DeploymentJob>;
