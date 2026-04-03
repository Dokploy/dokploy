import { type Job, Worker } from "bullmq";
import { logger } from "./logger.js";
import type { QueueJob } from "./schema.js";
import { runJobs } from "./utils.js";

export const firstWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Running job first worker");
		await runJobs(job.data);
	},
	{
		concurrency: 100,
		connection: {
			url: process.env.REDIS_URL!,
		},
	},
);
export const secondWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Running job second worker");
		await runJobs(job.data);
	},
	{
		concurrency: 100,
		connection: {
			url: process.env.REDIS_URL!,
		},
	},
);

export const thirdWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		logger.info({ data: job.data }, "Running job third worker");
		await runJobs(job.data);
	},
	{
		concurrency: 100,
		connection: {
			url: process.env.REDIS_URL!,
		},
	},
);
