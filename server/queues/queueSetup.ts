import { Queue, type ConnectionOptions } from "bullmq";

export const redisConfig: ConnectionOptions = {
	host: process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1",
	port: 6379,
};
// TODO: maybe add a options to clean the queue to the times
const myApplicationQueue = new Queue("deployments", {
	connection: redisConfig,
});

const myComposeQueue = new Queue("compose", {
	connection: redisConfig,
});

process.on("SIGTERM", () => {
	myApplicationQueue.close();
	myComposeQueue.close();
	process.exit(0);
});

myApplicationQueue.on("error", (error) => {
	if ((error as any).code === "ECONNREFUSED") {
		console.error(
			"Make sure you have installed Redis and it is running.",
			error,
		);
	}
});

myComposeQueue.on("error", (error) => {
	if ((error as any).code === "ECONNREFUSED") {
		console.error(
			"Make sure you have installed Redis and it is running.",
			error,
		);
	}
});

export { myApplicationQueue, myComposeQueue };
