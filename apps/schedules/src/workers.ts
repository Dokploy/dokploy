import { type Job, Worker } from "bullmq";
import type { QueueJob } from "./schema";
import { runJobs } from "./utils";
import { connection } from "./queue";
import { logger } from "./logger";

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
