import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	deployRemoteApplication,
	deployRemoteCompose,
	deployRemotePreviewApplication,
	findServerById,
	rebuildApplication,
	rebuildCompose,
	rebuildRemoteApplication,
	rebuildRemoteCompose,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { users_temp } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import type { DeploymentJob } from "./queue-types";

// Types for our p-limit based queue system
export interface QueueJob {
	id: string;
	data: DeploymentJob;
	createdAt: Date;
	status: "waiting" | "processing" | "completed" | "failed" | "cancelled";
	abortController: AbortController;
	promise?: Promise<void>;
}

export interface ServiceQueue {
	serviceId: string;
	jobs: QueueJob[];
	limit: ReturnType<typeof pLimit>; // p-limit instance with concurrency 1
}

// Global queue management using p-limit
class ServiceQueueManager {
	private queues: Map<string, ServiceQueue> = new Map();
	private globalLimit: ReturnType<typeof pLimit>;
	private isShuttingDown = false;

	constructor(globalConcurrency = 3) {
		// Global limit controls how many services can deploy simultaneously
		this.globalLimit = pLimit(globalConcurrency);
		this.setupShutdownHandlers();
	}

	// Set global concurrency (how many services can deploy simultaneously)
	setGlobalConcurrency(concurrency: number) {
		this.globalLimit = pLimit(concurrency);
	}

	// Get concurrency settings from database
	private async getConcurrencySettings(jobData: DeploymentJob): Promise<{
		serviceConcurrency: number;
	}> {
		try {
			// Default: Each service processes 1 deployment at a time (FIFO within service)
			let serviceConcurrency = 1;

			// If it's a server deployment, get server-specific concurrency
			// This controls how many deployments can run simultaneously ON THAT SERVER
			if (jobData.serverId) {
				try {
					const serverData = await findServerById(jobData.serverId);
					serviceConcurrency = serverData.concurrency || 1;
					console.log(
						`Server ${jobData.serverId} can handle ${serviceConcurrency} concurrent deployments`,
					);
				} catch (error) {
					console.warn(
						`Could not get server concurrency for ${jobData.serverId}, using default: 1`,
					);
				}
			}

			return {
				serviceConcurrency,
			};
		} catch (error) {
			console.warn(
				"Error getting concurrency settings, using defaults:",
				error,
			);
			return {
				serviceConcurrency: 1,
			};
		}
	}

	// Get or create a queue for a service with dynamic concurrency
	private async getOrCreateQueue(
		serviceId: string,
		jobData?: DeploymentJob,
	): Promise<ServiceQueue> {
		if (!this.queues.has(serviceId)) {
			let serviceConcurrency = 1; // Default

			// Get concurrency from database if we have job data
			if (jobData) {
				const settings = await this.getConcurrencySettings(jobData);
				serviceConcurrency = settings.serviceConcurrency;
			}

			this.queues.set(serviceId, {
				serviceId,
				jobs: [],
				// Service concurrency from database or default to 1
				limit: pLimit(serviceConcurrency),
			});

			console.log(
				`Created queue for service ${serviceId} with concurrency: ${serviceConcurrency}`,
			);
		}
		return this.queues.get(serviceId)!;
	}

	// Add a job to a service queue
	async addJob(
		serviceId: string,
		jobData: DeploymentJob,
		userId?: string,
	): Promise<string> {
		if (this.isShuttingDown) {
			throw new Error("Queue manager is shutting down");
		}

		// Update global concurrency based on user settings if provided
		// This controls the TOTAL number of deployments across ALL services for this user
		if (userId) {
			try {
				const userData = await db.query.users_temp.findFirst({
					where: eq(users_temp.id, userId),
				});

				if (userData?.serverConcurrency) {
					// This is GLOBAL concurrency - total deployments across all services
					this.globalLimit = pLimit(userData.serverConcurrency);
					console.log(
						`Set GLOBAL concurrency to ${userData.serverConcurrency} deployments total for user ${userId}`,
					);
				}
			} catch (error) {
				console.warn(
					`Could not get user concurrency settings for ${userId}:`,
					error,
				);
			}
		}

		const queue = await this.getOrCreateQueue(serviceId, jobData);
		const jobId = `${serviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const job: QueueJob = {
			id: jobId,
			data: jobData,
			createdAt: new Date(),
			status: "waiting",
			abortController: new AbortController(),
		};

		queue.jobs.push(job);
		console.log(
			`Added job ${jobId} to service ${serviceId} queue. Queue length: ${queue.jobs.length}`,
		);

		// Start processing the job using p-limit
		this.processJob(queue, job);

		return jobId;
	}

	// Process a job using both global and service-level p-limit
	private processJob(queue: ServiceQueue, job: QueueJob) {
		// Use global limit to control cross-service concurrency
		job.promise = this.globalLimit(() =>
			// Use service limit to ensure ordered processing within service
			queue.limit(async () => {
				if (job.status === "cancelled" || this.isShuttingDown) {
					return;
				}

				job.status = "processing";
				console.log(`Processing job ${job.id} for service ${queue.serviceId}`);

				try {
					await this.executeJob(job);
					job.status = "completed";
					console.log(`Completed job ${job.id} for service ${queue.serviceId}`);
				} catch (error) {
					if (job.abortController.signal.aborted) {
						job.status = "cancelled";
						console.log(
							`Job ${job.id} was cancelled for service ${queue.serviceId}`,
						);
					} else {
						job.status = "failed";
						console.error(
							`Job ${job.id} failed for service ${queue.serviceId}:`,
							error,
						);
					}
				} finally {
					// Clean up completed/failed jobs after a delay
					setTimeout(() => {
						queue.jobs = queue.jobs.filter((j) => j.id !== job.id);
					}, 5000);
				}
			}),
		);
	}

	// Remove/cancel jobs for a specific service
	cancelJobsByService(
		serviceId: string,
		applicationId?: string,
		composeId?: string,
	): number {
		const queue = this.queues.get(serviceId);
		if (!queue) return 0;

		let cancelledCount = 0;

		// Cancel waiting and processing jobs
		for (const job of queue.jobs) {
			if (job.status === "waiting" || job.status === "processing") {
				// Check if this job matches the filter criteria
				const matchesApplication = applicationId
					? (job.data.applicationType === "application" ||
							job.data.applicationType === "application-preview") &&
						job.data.applicationId === applicationId
					: true;
				const matchesCompose = composeId
					? job.data.applicationType === "compose" &&
						job.data.composeId === composeId
					: true;

				if (matchesApplication && matchesCompose) {
					job.status = "cancelled";
					job.abortController.abort();
					cancelledCount++;
					console.log(`Cancelled job ${job.id} for service ${serviceId}`);
				}
			}
		}

		// Remove cancelled jobs from queue immediately
		queue.jobs = queue.jobs.filter((job) => job.status !== "cancelled");

		return cancelledCount;
	}

	// Get queue status for a service
	getQueueStatus(serviceId: string) {
		const queue = this.queues.get(serviceId);
		if (!queue) return null;

		return {
			serviceId,
			totalJobs: queue.jobs.length,
			waitingJobs: queue.jobs.filter((j) => j.status === "waiting").length,
			processingJobs: queue.jobs.filter((j) => j.status === "processing")
				.length,
			completedJobs: queue.jobs.filter((j) => j.status === "completed").length,
			failedJobs: queue.jobs.filter((j) => j.status === "failed").length,
			// p-limit queue status
			activeCount: queue.limit.activeCount,
			pendingCount: queue.limit.pendingCount,
		};
	}

	// Get all queues status
	getAllQueuesStatus() {
		const status: Record<string, any> = {};
		for (const [serviceId] of this.queues) {
			status[serviceId] = this.getQueueStatus(serviceId);
		}
		status.global = {
			activeCount: this.globalLimit.activeCount,
			pendingCount: this.globalLimit.pendingCount,
			concurrency: this.globalLimit.concurrency,
		};
		return status;
	}

	// Clear pending jobs from a service queue using p-limit's clearQueue
	clearServiceQueue(serviceId: string) {
		const queue = this.queues.get(serviceId);
		if (queue) {
			// Cancel all waiting jobs
			for (const job of queue.jobs) {
				if (job.status === "waiting") {
					job.status = "cancelled";
					job.abortController.abort();
				}
			}

			// Clear p-limit's internal queue
			queue.limit.clearQueue();

			// Remove cancelled jobs
			queue.jobs = queue.jobs.filter((job) => job.status !== "cancelled");

			console.log(`Cleared service queue for ${serviceId}`);
		}
	}

	private async executeJob(job: QueueJob): Promise<void> {
		const { data } = job;

		// Check if job was cancelled before execution
		if (job.abortController.signal.aborted) {
			throw new Error("Job was cancelled");
		}

		try {
			if (data.applicationType === "application") {
				await updateApplicationStatus(data.applicationId, "running");

				if (data.server) {
					if (data.type === "redeploy") {
						await rebuildRemoteApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					} else if (data.type === "deploy") {
						await deployRemoteApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					}
				} else {
					if (data.type === "redeploy") {
						await rebuildApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					} else if (data.type === "deploy") {
						await deployApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					}
				}
			} else if (data.applicationType === "compose") {
				await updateCompose(data.composeId, {
					composeStatus: "running",
				});

				if (data.server) {
					if (data.type === "redeploy") {
						await rebuildRemoteCompose({
							composeId: data.composeId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					} else if (data.type === "deploy") {
						await deployRemoteCompose({
							composeId: data.composeId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					}
				} else {
					if (data.type === "deploy") {
						await deployCompose({
							composeId: data.composeId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					} else if (data.type === "redeploy") {
						await rebuildCompose({
							composeId: data.composeId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
						});
					}
				}
			} else if (data.applicationType === "application-preview") {
				await updatePreviewDeployment(data.previewDeploymentId, {
					previewStatus: "running",
				});
				if (data.server) {
					if (data.type === "deploy") {
						await deployRemotePreviewApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
							previewDeploymentId: data.previewDeploymentId,
						});
					}
				} else {
					if (data.type === "deploy") {
						await deployPreviewApplication({
							applicationId: data.applicationId,
							titleLog: data.titleLog,
							descriptionLog: data.descriptionLog,
							previewDeploymentId: data.previewDeploymentId,
						});
					}
				}
			}
		} catch (error) {
			console.log("Deployment Error", error);
			throw error;
		}
	}

	private setupShutdownHandlers() {
		const gracefulShutdown = async () => {
			console.log("Shutting down service queue manager...");
			this.isShuttingDown = true;

			// Cancel all jobs
			for (const queue of this.queues.values()) {
				for (const job of queue.jobs) {
					job.abortController.abort();
				}
				// Clear p-limit queues
				queue.limit.clearQueue();
			}

			// Clear global queue
			this.globalLimit.clearQueue();

			// Wait a bit for jobs to finish cancelling
			await new Promise((resolve) => setTimeout(resolve, 2000));
			process.exit(0);
		};

		process.on("SIGTERM", gracefulShutdown);
		process.on("SIGINT", gracefulShutdown);
	}

	// Remove a specific service queue entirely
	removeServiceQueue(serviceId: string) {
		const queue = this.queues.get(serviceId);
		if (queue) {
			// Cancel all jobs in the queue
			for (const job of queue.jobs) {
				job.abortController.abort();
			}
			// Clear p-limit queue
			queue.limit.clearQueue();
			this.queues.delete(serviceId);
			console.log(`Removed service queue for ${serviceId}`);
		}
	}
}

// Global instance
export const serviceQueueManager = new ServiceQueueManager();

// Helper functions to maintain compatibility with existing code
export const addDeploymentJob = async (
	serviceId: string,
	jobData: DeploymentJob,
	userId?: string,
): Promise<string> => {
	return await serviceQueueManager.addJob(serviceId, jobData, userId);
};

export const cancelDeploymentJobs = (
	serviceId: string,
	applicationId?: string,
	composeId?: string,
): number => {
	return serviceQueueManager.cancelJobsByService(
		serviceId,
		applicationId,
		composeId,
	);
};

export const getDeploymentQueueStatus = (serviceId?: string) => {
	if (serviceId) {
		return serviceQueueManager.getQueueStatus(serviceId);
	}
	return serviceQueueManager.getAllQueuesStatus();
};

export const setGlobalConcurrency = (concurrency: number) => {
	serviceQueueManager.setGlobalConcurrency(concurrency);
};

export const removeServiceQueue = (serviceId: string) => {
	serviceQueueManager.removeServiceQueue(serviceId);
};

export const clearServiceQueue = (serviceId: string) => {
	serviceQueueManager.clearServiceQueue(serviceId);
};
