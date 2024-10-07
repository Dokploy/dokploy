import { type Job, Worker } from "bullmq";
import { logger } from "./logger";
import { connection } from "./queue";
import type { QueueJob } from "./schema";
import { runJobs } from "./utils";

export const firstWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Job received");
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
		logger.info({ data: job.data }, "Job received");
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection,
	},
);
