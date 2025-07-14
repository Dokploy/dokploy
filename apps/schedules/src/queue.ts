import { Queue, type RepeatableJob } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger.js";
import type { QueueJob } from "./schema.js";

export const connection = new IORedis(process.env.REDIS_URL!, {
	maxRetriesPerRequest: null,
});
export const jobQueue = new Queue("backupQueue", {
	connection,
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
	} else if (job.type === "schedule") {
		jobQueue.add(job.scheduleId, job, {
			repeat: {
				pattern: job.cronSchedule,
			},
		});
	} else if (job.type === "volume-backup") {
		jobQueue.add(job.volumeBackupId, job, {
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
	if (data.type === "schedule") {
		const { scheduleId, cronSchedule } = data;
		const result = await jobQueue.removeRepeatable(scheduleId, {
			pattern: cronSchedule,
		});
		return result;
	}
	if (data.type === "volume-backup") {
		const { volumeBackupId, cronSchedule } = data;
		const result = await jobQueue.removeRepeatable(volumeBackupId, {
			pattern: cronSchedule,
		});
		return result;
	}
	return false;
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
