import {
	type BackupScheduleList,
	IS_CLOUD,
	removeScheduleBackup,
	updateBackupById,
} from "@dokploy/server/index";

type QueueJob =
	| {
			type: "backup";
			cronSchedule: string;
			backupId: string;
	  }
	| {
			type: "server";
			cronSchedule: string;
			serverId: string;
	  }
	| {
			type: "schedule";
			cronSchedule: string;
			scheduleId: string;
	  }
	| {
			type: "volume-backup";
			cronSchedule: string;
			volumeBackupId: string;
	  };
export const schedule = async (job: QueueJob) => {
	try {
		const result = await fetch(`${process.env.JOBS_URL}/create-backup`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(job),
		});
		const data = await result.json();
		return data;
	} catch (error) {
		throw error;
	}
};

export const removeJob = async (job: QueueJob) => {
	try {
		const result = await fetch(`${process.env.JOBS_URL}/remove-job`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(job),
		});
		const data = await result.json();
		return data;
	} catch (error) {
		throw error;
	}
};

export const updateJob = async (job: QueueJob) => {
	try {
		const result = await fetch(`${process.env.JOBS_URL}/update-backup`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(job),
		});
		const data = await result.json();
		return data;
	} catch (error) {
		throw error;
	}
};

export const cancelJobs = async (backups: BackupScheduleList) => {
	for (const backup of backups) {
		if (backup.enabled) {
			// First disable the backup to prevent rescheduling
			try {
				await updateBackupById(backup.backupId, { enabled: false });
			} catch (error) {
				// If backup is already deleted (cascade), ignore the error
				console.error(`Failed to disable backup ${backup.backupId}:`, error);
			}

			// Then cancel the scheduled job
			try {
				if (IS_CLOUD) {
					await removeJob({
						cronSchedule: backup.schedule,
						backupId: backup.backupId,
						type: "backup",
					});
				} else {
					removeScheduleBackup(backup.backupId);
				}
			} catch (error) {
				// Log but don't fail if job cancellation fails
				console.error(`Failed to cancel backup job ${backup.backupId}:`, error);
			}
		}
	}
};
