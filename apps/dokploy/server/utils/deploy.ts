import {
	type DeploymentJob,
	findServerById,
	queueDeployment,
} from "@dokploy/server";

export const deploy = async (job: DeploymentJob) => {
	if (!job.serverId) throw new Error("Cloud deployments require a server");
	const server = await findServerById(job.serverId);
	if (server.serverStatus === "inactive") throw new Error("Server is inactive");
	const deployment = await queueDeployment(job, "inngest");
	try {
		const result = await fetch(`${process.env.SERVER_URL}/deploy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify({ deploymentId: deployment.deploymentId }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!result.ok)
			throw new Error(`Deployment service returned ${result.status}`);
	} catch (error) {
		// The API's scheduled dispatcher will retry the committed delivery.
		console.error(
			"Deployment remains queued for delivery",
			deployment.deploymentId,
			error,
		);
	}
	return deployment;
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
