import type { DeploymentJob } from "./queue-types";
import {
	addDeploymentJob,
	cancelDeploymentJobs,
	getDeploymentQueueStatus,
	setGlobalConcurrency,
} from "./service-queue";

// Default queue name for local deployments
export const DEFAULT_QUEUE = "default";

// Initialize with default concurrency of 3 services
setGlobalConcurrency(3);

// Helper function to determine service ID from job data
// Groups deployments by SERVER, not by individual application/compose
const getServiceId = (jobData: DeploymentJob): string => {
	// If it has a serverId, group by that server
	if (jobData.serverId) {
		return jobData.serverId;
	}

	// For local deployments (no serverId), group all under the main Dokploy server
	return "dokploy-server";
};

// Compatibility functions to replace BullMQ usage
export const myQueue = {
	add: async (
		_name: string,
		jobData: DeploymentJob,
		_options?: any,
		userId?: string,
	) => {
		const serviceId = getServiceId(jobData);
		const jobId = await addDeploymentJob(serviceId, jobData, userId);
		console.log(`Added deployment job ${jobId} to service ${serviceId}`);
		return { id: jobId };
	},

	close: () => {
		console.log("Service queue manager shutdown initiated");
		return Promise.resolve();
	},
};

export const cleanQueuesByApplication = async (applicationId: string) => {
	// Cancel jobs for this specific application across all servers
	let totalCancelled = 0;

	// Check the local Dokploy server
	const localCancelled = cancelDeploymentJobs(
		"dokploy-server",
		applicationId,
		undefined,
	);
	totalCancelled += localCancelled;

	// TODO: Also check remote servers if we need to track which servers have this application
	// For now, we only clean from the local server queue

	console.log(
		`Cancelled ${totalCancelled} jobs for application ${applicationId}`,
	);
	return totalCancelled;
};

export const cleanQueuesByCompose = async (composeId: string) => {
	// Cancel jobs for this specific compose across all servers
	let totalCancelled = 0;

	// Check the local Dokploy server
	const localCancelled = cancelDeploymentJobs(
		"dokploy-server",
		undefined,
		composeId,
	);
	totalCancelled += localCancelled;

	// TODO: Also check remote servers if we need to track which servers have this compose
	// For now, we only clean from the local server queue

	console.log(`Cancelled ${totalCancelled} jobs for compose ${composeId}`);
	return totalCancelled;
};

// Export queue status for monitoring
export const getQueueStatus = getDeploymentQueueStatus;

// New function to add jobs with user context (for API routes)
export const addJobWithUserContext = async (
	jobData: DeploymentJob,
	userId?: string,
): Promise<{ id: string }> => {
	const serviceId = getServiceId(jobData);
	const jobId = await addDeploymentJob(serviceId, jobData, userId);
	console.log(
		`Added deployment job ${jobId} to service ${serviceId} with user context ${userId || "none"}`,
	);
	return { id: jobId };
};
