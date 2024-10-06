import { Queue } from "bullmq";
import { logger } from "./logger";
import type { QueueJob } from "./schema";

export const jobQueue = new Queue("backupQueue", {
	connection: {
		host: process.env.REDIS_URL,
	},
	defaultJobOptions: {
		removeOnComplete: true,
		removeOnFail: true,
	},
});

export const cleanQueue = async () => {
	try {
		await jobQueue.obliterate({ force: true });
		logger.info("Queue Cleaned");
	} catch (error) {
		logger.error("Error cleaning queue:", error);
	}
};

export const scheduleJob = (job: QueueJob) => {
	if (job.type === "backup") {
		jobQueue.add(job.backupId, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	} else if (job.type === "server") {
		jobQueue.add(`${job.serverId}-cleanup`, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	}
};

export const removeJob = async (data: QueueJob) => {
	if (data.type === "backup") {
		const { backupId, cronSchedule } = data;
		const result = await jobQueue.removeRepeatable(backupId, {
			pattern: cronSchedule,
		});
		return result;
	}
	if (data.type === "server") {
		const { serverId, cronSchedule } = data;
		const result = await jobQueue.removeRepeatable(`${serverId}-cleanup`, {
			pattern: cronSchedule,
		});
		return result;
	}
};
