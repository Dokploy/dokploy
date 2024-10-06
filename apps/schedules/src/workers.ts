import { type Job, Worker } from "bullmq";
import type { QueueJob } from "./schema";
import { runJobs } from "./utils";

export const firstWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection: {
			host: process.env.REDIS_URL,
		},
	},
);
export const secondWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection: {
			host: process.env.REDIS_URL,
		},
	},
);
