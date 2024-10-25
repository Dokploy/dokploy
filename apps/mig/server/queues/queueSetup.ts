import { type ConnectionOptions, Queue } from "bullmq";

export const redisConfig: ConnectionOptions = {
	host: process.env.NODE_ENV === "production" ? "dokploy-redis" : "127.0.0.1",
};
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
