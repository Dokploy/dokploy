import { type Job, Worker } from "bullmq";
import { logger } from "./logger.js";
import { connection } from "./queue.js";
import type { QueueJob } from "./schema.js";
import { runJobs } from "./utils.js";

export const firstWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Running job");
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection,
	},
);
export const secondWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Running job");
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection,
	},
);
