import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	deployRemoteApplication,
	deployRemoteCompose,
	deployRemotePreviewApplication,
	rebuildApplication,
	rebuildCompose,
	rebuildRemoteApplication,
	rebuildRemoteCompose,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import { type Job, Worker } from "bullmq";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";
import { DEFAULT_QUEUE } from "./queueSetup";

// ------------------------------------------------------------------------------------------------
// Worker management - per server instance
// ------------------------------------------------------------------------------------------------

// A map that keeps one worker per serverId ("default" key is for local deployments)
type WorkersMap = Record<string, Worker>;

declare global {
	// eslint-disable-next-line no-var, vars-on-top
	var __deploymentWorkers: WorkersMap | undefined;
}

export const getWorkersMap = (): WorkersMap => {
	if (!global.__deploymentWorkers) {
		global.__deploymentWorkers = {};
	}
	return global.__deploymentWorkers;
};

export const getWorker = (serverId?: string): Worker | undefined => {
	const key = serverId ?? DEFAULT_QUEUE;
	return getWorkersMap()[key];
};

const createWorker = (
	queueName: string,
	concurrency: number,
	serverIdKey: string,
) => {
	const workers = getWorkersMap();
	if (workers[serverIdKey]) return workers[serverIdKey];

	const worker = new Worker<DeploymentJob>(
		queueName,
		async (job: Job<DeploymentJob>) => {
			try {
				if (job.data.applicationType === "application") {
					await updateApplicationStatus(job.data.applicationId, "running");

					if (job.data.server) {
						if (job.data.type === "redeploy") {
							await rebuildRemoteApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						} else if (job.data.type === "deploy") {
							await deployRemoteApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						}
					} else {
						if (job.data.type === "redeploy") {
							await rebuildApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						} else if (job.data.type === "deploy") {
							await deployApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						}
					}
				} else if (job.data.applicationType === "compose") {
					await updateCompose(job.data.composeId, {
						composeStatus: "running",
					});

					if (job.data.server) {
						if (job.data.type === "redeploy") {
							await rebuildRemoteCompose({
								composeId: job.data.composeId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						} else if (job.data.type === "deploy") {
							await deployRemoteCompose({
								composeId: job.data.composeId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						}
					} else {
						if (job.data.type === "deploy") {
							await deployCompose({
								composeId: job.data.composeId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						} else if (job.data.type === "redeploy") {
							await rebuildCompose({
								composeId: job.data.composeId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
							});
						}
					}
				} else if (job.data.applicationType === "application-preview") {
					await updatePreviewDeployment(job.data.previewDeploymentId, {
						previewStatus: "running",
					});
					if (job.data.server) {
						if (job.data.type === "deploy") {
							await deployRemotePreviewApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
								previewDeploymentId: job.data.previewDeploymentId,
							});
						}
					} else {
						if (job.data.type === "deploy") {
							await deployPreviewApplication({
								applicationId: job.data.applicationId,
								titleLog: job.data.titleLog,
								descriptionLog: job.data.descriptionLog,
								previewDeploymentId: job.data.previewDeploymentId,
							});
						}
					}
				}
			} catch (error) {
				console.log("Error", error);
			}
		},
		{
			autorun: false,
			connection: redisConfig,
			concurrency,
		},
	);

	worker.run();
	workers[serverIdKey] = worker;
	return worker;
};

// ------------------------------------------------------------------------------------------------
// Public helpers
// ------------------------------------------------------------------------------------------------

export const createDeploymentWorker = (defaultConcurrency = 1): Worker => {
	return createWorker("deployments", defaultConcurrency, "default");
};

export const createServerDeploymentWorker = (
	serverId: string,
	concurrency = 1,
): Worker => {
	return createWorker(`deployments-${serverId}`, concurrency, serverId);
};

export const removeServerDeploymentWorker = (serverId: string) => {
	const workers = getWorkersMap();

	if (workers[serverId]) {
		workers[serverId].close();
		delete workers[serverId];
	}
};
