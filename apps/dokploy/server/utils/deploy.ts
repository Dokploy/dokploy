import type { DeploymentJob } from "../queues/deployments-queue";

export const deploy = async (jobData: DeploymentJob) => {
	try {
		const result = await fetch(`${process.env.SERVER_URL}/deploy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(jobData),
		});
		const data = await result.json();
		console.log(data);
		return data;
	} catch (error) {
		console.log(error);
		throw error;
	}
};
