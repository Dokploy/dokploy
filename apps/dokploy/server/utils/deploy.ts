import {
	cancelStaleDeployment,
	findServerById,
	type QueuedDeploymentJob,
} from "@dokploy/server";

export const deploy = async (jobData: QueuedDeploymentJob) => {
	if (!jobData.serverId) throw new Error("Cloud deployments require a server");
	const server = await findServerById(jobData.serverId);
	if (server.serverStatus === "inactive") throw new Error("Server is inactive");
	const result = await fetch(`${process.env.SERVER_URL}/deploy`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify(jobData),
	});
	if (!result.ok)
		throw new Error(
			`Deployment service rejected the request (${result.status})`,
		);
};

export const cancelDeployment = async (deploymentId: string) => {
	const result = await fetch(`${process.env.SERVER_URL}/cancel-deployment`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": process.env.API_KEY || "NO-DEFINED",
		},
		body: JSON.stringify({ deploymentId }),
	});
	if (!result.ok)
		throw new Error(
			`Deployment service rejected cancellation (${result.status})`,
		);
	await cancelStaleDeployment(deploymentId);
};

export type QueueJobRow = {
	id: string;
	name?: string;
	data: Record<string, unknown>;
	timestamp?: number;
	processedOn?: number;
	finishedOn?: number;
	failedReason?: string;
	state: string;
};

export const fetchDeployApiJobs = async (
	serverId: string,
): Promise<QueueJobRow[]> => {
	try {
		const res = await fetch(
			`${process.env.SERVER_URL}/jobs?serverId=${encodeURIComponent(serverId)}`,
			{
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": process.env.API_KEY || "NO-DEFINED",
				},
			},
		);
		if (!res.ok) return [];
		return (await res.json()) as QueueJobRow[];
	} catch {
		return [];
	}
};
