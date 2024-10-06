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
			},
			body: JSON.stringify(job),
		});
		const data = await result.json();
		console.log(data);
		return data;
	} catch (error) {
		console.log(error);
		throw error;
	}
};

export const removeJob = async (job: QueueJob) => {
	try {
		const result = await fetch(`${process.env.JOBS_URL}/remove-job`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(job),
		});
		const data = await result.json();
		console.log(data);
		return data;
	} catch (error) {
		console.log(error);
		throw error;
	}
};
