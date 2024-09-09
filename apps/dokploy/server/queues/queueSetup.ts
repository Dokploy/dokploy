import { type ConnectionOptions, type Job, Queue, Worker } from "bullmq";
import { findServerById, type Server } from "../api/services/server";
import type { DeploymentJob } from "./deployments-queue";
import {
	deployApplication,
	updateApplicationStatus,
} from "../api/services/application";

export const redisConfig: ConnectionOptions = {
	host: "31.220.108.27",
	password: "xYBugfHkULig1iLN",
	// host: process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1",
	port: 1233,
};
// TODO: maybe add a options to clean the queue to the times
const myQueue = new Queue("deployments", {
	connection: redisConfig,
});

process.on("SIGTERM", () => {
	myQueue.close();
	process.exit(0);
});

myQueue.on("error", (error) => {
	if ((error as any).code === "ECONNREFUSED") {
		console.error(
			"Make sure you have installed Redis and it is running.",
			error,
		);
	}
});

export { myQueue };

const workersMap = new Map<string, Worker>();
const queuesMap = new Map<string, Queue>();

function createRedisConnection(server: Server) {
	return {
		host: server.ipAddress,
		port: "6379",
	} as ConnectionOptions;
}

async function setupServerQueueAndWorker(server: Server) {
	const connection = createRedisConnection(server);

	if (!workersMap.has(server.serverId)) {
		const queue = new Queue(`deployments-${server.serverId}`, {
			connection,
		});
		const worker = new Worker(
			`deployments-${server.serverId}`,
			async (job: Job<DeploymentJob>) => {
				// Ejecuta el trabajo de despliegue
				if (job.data.applicationType === "application") {
					await updateApplicationStatus(job.data.applicationId, "running");
					if (job.data.type === "deploy") {
						await deployApplication({
							applicationId: job.data.applicationId,
							titleLog: job.data.titleLog,
							descriptionLog: job.data.descriptionLog,
						});
					}
				}
			},
			{
				limiter: {
					max: 1,
					duration: 1000,
				},
				connection,
			},
		);
		// Almacena worker y queue para reutilizar
		workersMap.set(server.serverId, worker);
		queuesMap.set(server.serverId, queue);
	}
	return {
		queue: queuesMap.get(server.serverId),
		worker: workersMap.get(server.serverId),
	};
}

export async function enqueueDeploymentJob(
	serverId: string,
	jobData: DeploymentJob,
) {
	const server = await findServerById(serverId);
	const { queue } = await setupServerQueueAndWorker(server);

	await queue?.add(`deployments-${serverId}`, jobData, {
		removeOnComplete: true,
		removeOnFail: true,
	});
}
