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
