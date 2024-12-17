import { Queue } from "bullmq";
import { redisConfig } from "./redis-connection";

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

export const cleanQueuesByApplication = async (applicationId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.applicationId === applicationId) {
			await job.remove();
			console.log(`Removed job ${job.id} for application ${applicationId}`);
		}
	}
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.composeId === composeId) {
			await job.remove();
			console.log(`Removed job ${job.id} for compose ${composeId}`);
		}
	}
};

export { myQueue };
