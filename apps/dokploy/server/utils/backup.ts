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
export const schedule = async (job: QueueJob) => {
	const result = await fetch(`${process.env.JOBS_URL}/create-backup`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify(job),
	});
	if (!result.ok) {
		const errorText = await result.text().catch(() => "");
		throw new Error(
			`Failed to register schedule job: ${result.status} ${errorText}`.trim(),
		);
	}
	return result.json();
};

export const removeJob = async (job: QueueJob) => {
	const result = await fetch(`${process.env.JOBS_URL}/remove-job`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify(job),
	});
	if (!result.ok) {
		const errorText = await result.text().catch(() => "");
		throw new Error(
			`Failed to remove schedule job: ${result.status} ${errorText}`.trim(),
		);
	}
	return result.json();
};

export const updateJob = async (job: QueueJob) => {
	const result = await fetch(`${process.env.JOBS_URL}/update-backup`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify(job),
	});
	if (!result.ok) {
		const errorText = await result.text().catch(() => "");
		throw new Error(
			`Failed to update schedule job: ${result.status} ${errorText}`.trim(),
		);
	}
	return result.json();
};

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
