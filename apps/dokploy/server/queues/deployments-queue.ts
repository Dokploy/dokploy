// This file is kept for backward compatibility but now uses the new service-queue system
// The actual queue logic has been moved to service-queue.ts using p-limit

import { serviceQueueManager } from "./service-queue";

// Legacy compatibility - this is no longer used but kept to avoid breaking imports
export const deploymentWorker = {
	run: async () => {
		console.log(
			"Legacy deploymentWorker.run() called - now using service-queue system",
		);
		// The service queue manager starts automatically, no need to do anything
		return Promise.resolve();
	},
	close: async () => {
		console.log("Legacy deploymentWorker.close() called");
		return Promise.resolve();
	},
};

// Legacy exports for backward compatibility
export const getWorkersMap = () => {
	console.warn(
		"getWorkersMap() is deprecated - use serviceQueueManager instead",
	);
	return {};
};

export const getWorker = (_serverId?: string) => {
	console.warn("getWorker() is deprecated - use serviceQueueManager instead");
	return undefined;
};

export const createDeploymentWorker = (defaultConcurrency = 1) => {
	console.warn(
		"createDeploymentWorker() is deprecated - use serviceQueueManager instead",
	);
	serviceQueueManager.setGlobalConcurrency(defaultConcurrency);
	return deploymentWorker;
};

export const createServerDeploymentWorker = (
	_serverId: string,
	_concurrency = 1,
) => {
	console.warn(
		"createServerDeploymentWorker() is deprecated - use serviceQueueManager instead",
	);
	// The new system automatically creates queues per service, no need for explicit worker creation
	return deploymentWorker;
};

export const removeServerDeploymentWorker = (serverId: string) => {
	console.warn(
		"removeServerDeploymentWorker() is deprecated - use removeServiceQueue instead",
	);
	serviceQueueManager.removeServiceQueue(serverId);
};
