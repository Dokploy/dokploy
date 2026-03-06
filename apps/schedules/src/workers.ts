import { type Job, Worker } from "bullmq";
import { logger } from "./logger.js";
import type { QueueJob } from "./schema.js";
import { runJobs } from "./utils.js";

const workerCount = Number(process.env.SCHEDULE_WORKER_COUNT) || 3;
const workerConcurrency =
	Number(process.env.SCHEDULE_WORKER_CONCURRENCY) || 100;

export const workers: Worker[] = [];

for (let i = 0; i < workerCount; i++) {
	const worker = new Worker(
		"backupQueue",
		async (job: Job<QueueJob>) => {
			logger.info({ data: job.data }, `Running job worker-${i}`);
			await runJobs(job.data);
		},
		{
			concurrency: workerConcurrency,
			connection: {
				url: process.env.REDIS_URL!,
			},
		},
	);
	workers.push(worker);
}
