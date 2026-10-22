import {
	type BackupScheduleList,
	IS_CLOUD,
	removeScheduleBackup,
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
			timezone?: string | null;
	  }
	| {
			type: "volume-backup";
			cronSchedule: string;
			volumeBackupId: string;
	  };
const postJob = async (path: string, job: QueueJob) => {
	const result = await fetch(`${process.env.JOBS_URL}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify(job),
	});
	const data = await result.json();
	if (!result.ok) {
		throw new Error(
			`Jobs service ${path} failed (${result.status}): ${JSON.stringify(data)}`,
		);
	}
	return data;
};

export const schedule = (job: QueueJob) => postJob("/create-backup", job);

export const removeJob = (job: QueueJob) => postJob("/remove-job", job);

export const updateJob = (job: QueueJob) => postJob("/update-backup", job);

export const cancelJobs = async (backups: BackupScheduleList) => {
	for (const backup of backups) {
		if (backup.enabled) {
			if (IS_CLOUD) {
				await removeJob({
					cronSchedule: backup.schedule,
					backupId: backup.backupId,
					type: "backup",
				});
			} else {
				removeScheduleBackup(backup.backupId);
			}
		}
	}
};
