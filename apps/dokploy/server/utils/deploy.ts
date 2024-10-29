import { findServerById } from "@dokploy/server";
import type { DeploymentJob } from "../queues/queue-types";

export const deploy = async (jobData: DeploymentJob) => {
	try {
		const server = await findServerById(jobData.serverId as string);
		if (server.serverStatus === "inactive") {
			throw new Error("Server is inactive");
		}

		console.log(jobData);
		console.log(`${process.env.SERVER_URL}/deploy`);
		const result = await fetch(`${process.env.SERVER_URL}/deploy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(jobData),
		});

		console.log("Status:", result.status);
		console.log("Content-Type:", result.headers.get("content-type"));
		console.log("Body:", await result.text());
		console.log(result);
		const data = await result.json();
		console.log(data);
		return data;
	} catch (error) {
		console.log(error);
		throw error;
	}
};
