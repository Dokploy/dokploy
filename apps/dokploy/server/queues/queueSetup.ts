import { Queue } from "bullmq";
import { redisConfig } from "./redis-connection";

export const DEFAULT_QUEUE = "deployments";

// Map to keep track of BullMQ queues per serverId. The key "default" is used
// for local deployments where no dedicated serverId exists.
const queues: Map<string, Queue> = new Map();

const createQueue = (serverId?: string | null): Queue => {
	const key = serverId ?? DEFAULT_QUEUE;

	if (queues.has(key)) {
		return queues.get(key)!;
	}

	const queueName = serverId ? `deployments-${serverId}` : "deployments";
	const queue = new Queue(queueName, {
		connection: redisConfig,
	});

	queue.on("error", (error) => {
		if ((error as any).code === "ECONNREFUSED") {
			console.error(
				"Make sure you have installed Redis and it is running.",
				error,
			);
		}
	});

	queues.set(key, queue);
	return queue;
};

export const getQueue = (serverId?: string | null): Queue => {
	return createQueue(serverId);
};

process.on("SIGTERM", async () => {
	for (const queue of queues.values()) {
		await queue.close();
	}
	process.exit(0);
});

export const cleanQueuesByApplication = async (applicationId: string) => {
	for (const queue of queues.values()) {
		const jobs = await queue.getJobs(["waiting", "delayed"]);
		for (const job of jobs) {
			if (job?.data?.applicationId === applicationId) {
				await job.remove();
				console.log(`Removed job ${job.id} for application ${applicationId}`);
			}
		}
	}
};

export const cleanQueuesByCompose = async (composeId: string) => {
	for (const queue of queues.values()) {
		const jobs = await queue.getJobs(["waiting", "delayed"]);
		for (const job of jobs) {
			if (job?.data?.composeId === composeId) {
				await job.remove();
				console.log(`Removed job ${job.id} for compose ${composeId}`);
			}
		}
	}
};
