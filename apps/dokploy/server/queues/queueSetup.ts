import { GroupedQueue } from "./grouped-queue-wrapper";
import type { DeploymentJob } from "./queue-types";

// In-memory grouped queue: processes one job per group at a time
// Multiple groups can process in parallel (up to concurrency limit)
// Concurrency can be configured via DEPLOYMENT_QUEUE_CONCURRENCY env var (default: 1)
// or dynamically via setConcurrency() function
let DEPLOYMENT_CONCURRENCY = Number.parseInt(
	process.env.DEPLOYMENT_QUEUE_CONCURRENCY || "1",
	10,
);

// Validate concurrency is at least 1
if (DEPLOYMENT_CONCURRENCY < 1) {
	DEPLOYMENT_CONCURRENCY = 1;
}

const myQueue = new GroupedQueue<DeploymentJob>(DEPLOYMENT_CONCURRENCY);

// Initialize handler when this module is imported
// Use dynamic import to avoid circular dependency
// The handler will be set when deployments-queue.ts is imported
let handlerInitialized = false;
const initializeHandler = async () => {
	if (!handlerInitialized) {
		handlerInitialized = true;
		// This will set the handler
		await import("./deployments-queue");
	}
};

// Initialize handler immediately (non-blocking)
void initializeHandler();

process.on("SIGTERM", async () => {
	await myQueue.close();
	process.exit(0);
});

export const cleanQueuesByApplication = async (applicationId: string) => {
	const groupId = `application:${applicationId}`;
	myQueue.clearGroup(groupId);
	console.log(`Cleared queue for application ${applicationId}`);
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const groupId = `compose:${composeId}`;
	myQueue.clearGroup(groupId);
	console.log(`Cleared queue for compose ${composeId}`);
};

/**
 * Add a job to the queue without awaiting (fire-and-forget)
 * This allows the API to return immediately while the job processes in the background
 * Errors are logged but don't block the response
 */
export const addJobAsync = (groupId: string, data: DeploymentJob): void => {
	// Fire and forget - don't await, but handle errors
	myQueue.add(groupId, data).catch((error) => {
		console.error(`Failed to queue job for group ${groupId}:`, error);
	});
};

/**
 * Get the current deployment queue concurrency
 */
export const getConcurrency = (): number => {
	return myQueue.getConcurrency();
};

/**
 * Set the deployment queue concurrency dynamically
 * This updates the queue's concurrency setting immediately
 * WARNING: This will clear all pending builds when concurrency changes
 * @returns The number of pending builds that were cleared
 */
export const setConcurrency = (concurrency: number): number => {
	if (concurrency < 1) {
		throw new Error("Concurrency must be at least 1");
	}

	const currentConcurrency = myQueue.getConcurrency();
	const concurrencyChanged = currentConcurrency !== concurrency;

	// Get count of pending tasks before clearing (setConcurrency will clear them)
	let clearedCount = 0;
	if (concurrencyChanged) {
		// Get the count before setConcurrency clears them
		clearedCount = myQueue.getTotalLength();
		if (process.env.NODE_ENV !== "test") {
			console.log(
				`Concurrency changing from ${currentConcurrency} to ${concurrency}. Will clear ${clearedCount} pending builds.`,
			);
		}
	}

	// Update the stored concurrency value
	DEPLOYMENT_CONCURRENCY = concurrency;

	// Update the queue's concurrency dynamically (this will clear pending tasks)
	myQueue.setConcurrency(concurrency);

	if (process.env.NODE_ENV !== "test") {
		console.log(`Deployment queue concurrency updated to ${concurrency}`);
	}

	return clearedCount;
};

export { myQueue };
