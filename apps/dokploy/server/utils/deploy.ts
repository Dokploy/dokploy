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

type CancelDeploymentData =
	| { applicationId: string; applicationType: "application" }
	| { composeId: string; applicationType: "compose" };

export const cancelDeployment = async (cancelData: CancelDeploymentData) => {
	try {
		const result = await fetch(`${process.env.SERVER_URL}/cancel-deployment`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": process.env.API_KEY || "NO-DEFINED",
			},
			body: JSON.stringify(cancelData),
		});

		if (!result.ok) {
			const errorData = await result.json().catch(() => ({}));
			throw new Error(errorData.message || "Failed to cancel deployment");
		}

		const data = await result.json();
		return data;
	} catch (error) {
		throw error;
	}
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
