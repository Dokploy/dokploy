import type { DeploymentJob } from "../queues/deployments-queue";

export const deploy = async (jobData: DeploymentJob) => {
	try {
		const result = await fetch("http://127.0.0.1:4000/deploy", {
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
		throw error;
	}
};
