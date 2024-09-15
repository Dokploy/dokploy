import { type ConnectionOptions, type Job, Queue, Worker } from "bullmq";
import { findServerById, type Server } from "../api/services/server";
import type { DeploymentJob } from "./deployments-queue";
import {
	deployApplication,
	rebuildApplication,
	updateApplicationStatus,
} from "../api/services/application";
import {
	updateCompose,
	deployCompose,
	rebuildCompose,
} from "../api/services/compose";

export const redisConfig: ConnectionOptions = {
	// host: "31.220.108.27",
	// password: "xYBugfHkULig1iLN",
	host: process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1",
	// port: 1233,
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
