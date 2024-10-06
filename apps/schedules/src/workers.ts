import { type Job, Worker } from "bullmq";
import type { QueueJob } from "./schema";
import { runJobs } from "./utils";
import { connection } from "./queue";

export const firstWorker = new Worker(
	"backupQueue",
	async (job: Job<QueueJob>) => {
		console.log("Job received", job.data);
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
		console.log(job.data);
		await runJobs(job.data);
	},
	{
		concurrency: 50,
		connection,
	},
);
