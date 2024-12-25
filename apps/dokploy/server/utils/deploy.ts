import { findServerById } from "@dokploy/server";
import type { DeploymentJob } from "../queues/queue-types";

export const deploy = async (jobData: DeploymentJob) => {
	try {
		const server = await findServerById(jobData.serverId as string);
		if (server.serverStatus === "inactive") {
			throw new Error("Server is inactive");
		}

		const result = await fetch(`${process.env.SERVER_URL}/deploy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(jobData),
		});

		const data = await result.json();
		return data;
	} catch (error) {
		throw error;
	}
};
