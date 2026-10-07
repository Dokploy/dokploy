import { Queue, type RepeatableJob } from "bullmq";
import { logger } from "./logger.js";
import type { QueueJob } from "./schema.js";

export const jobQueue = new Queue("backupQueue", {
	connection: {
		url: process.env.REDIS_URL!,
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

export const scheduleJob = async (job: QueueJob) => {
	if (job.type === "backup") {
		await jobQueue.add(job.backupId, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	} else if (job.type === "server") {
		await jobQueue.add(`${job.serverId}-cleanup`, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	} else if (job.type === "schedule") {
		await jobQueue.add(job.scheduleId, job, {
			repeat: {
				pattern: job.cronSchedule,
				tz: job.timezone || "UTC",
			},
		});
	} else if (job.type === "volume-backup") {
		await jobQueue.add(job.volumeBackupId, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	}
};

export const removeJob = async (data: QueueJob) => {
	const job = await getJobRepeatable(data);
	if (!job) {
		return false;
	}
	return await jobQueue.removeRepeatable(job.name, {
		pattern: job.pattern || undefined,
		tz: job.tz || undefined,
	});
};

export const getJobRepeatable = async (
	data: QueueJob,
): Promise<RepeatableJob | null> => {
	const repeatableJobs = await jobQueue.getRepeatableJobs();
	if (data.type === "backup") {
		const { backupId } = data;
		const job = repeatableJobs.find((j) => j.name === backupId);
		return job ? job : null;
	}
	if (data.type === "server") {
		const { serverId } = data;
		const job = repeatableJobs.find((j) => j.name === `${serverId}-cleanup`);
		return job ? job : null;
	}
	if (data.type === "schedule") {
		const { scheduleId } = data;
		const job = repeatableJobs.find((j) => j.name === scheduleId);
		return job ? job : null;
	}
	if (data.type === "volume-backup") {
		const { volumeBackupId } = data;
		const job = repeatableJobs.find((j) => j.name === volumeBackupId);
		return job ? job : null;
	}
	return null;
};
