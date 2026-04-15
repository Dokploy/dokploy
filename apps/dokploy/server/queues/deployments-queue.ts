import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	findPreviewDeploymentRecordById,
	IS_CLOUD,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import { type Job, Worker } from "bullmq";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

const createDeploymentWorker = () =>
	new Worker(
		"deployments",
		async (job: Job<DeploymentJob>) => {
			try {
				if (job.data.applicationType === "application") {
					await updateApplicationStatus(job.data.applicationId, "running");

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
				} else if (job.data.applicationType === "compose") {
					await updateCompose(job.data.composeId, {
						composeStatus: "running",
					});
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
				} else if (job.data.applicationType === "application-preview") {
					const previewJob = job.data;
					const previewDeployment = await findPreviewDeploymentRecordById(
						previewJob.previewDeploymentId,
					).catch((error) => {
						console.error(
							"Failed to look up preview deployment before queue execution",
							{
								previewDeploymentId: previewJob.previewDeploymentId,
								applicationId: previewJob.applicationId,
								type: previewJob.type,
								error,
							},
						);
						return null;
					});

					if (!previewDeployment) {
						return;
					}

					await updatePreviewDeployment(previewJob.previewDeploymentId, {
						previewStatus: "running",
					});

					if (previewJob.type === "redeploy") {
						await rebuildPreviewApplication({
							applicationId: previewJob.applicationId,
							titleLog: previewJob.titleLog,
							descriptionLog: previewJob.descriptionLog,
							previewDeploymentId: previewJob.previewDeploymentId,
						});
					} else if (previewJob.type === "deploy") {
						await deployPreviewApplication({
							applicationId: previewJob.applicationId,
							titleLog: previewJob.titleLog,
							descriptionLog: previewJob.descriptionLog,
							previewDeploymentId: previewJob.previewDeploymentId,
						});
					}
				}
			} catch (error) {
				console.log("Error", error);
			}
		},
		{
			autorun: false,
			connection: redisConfig,
		},
	);

/** No-op worker when Redis is disabled (e.g. IS_CLOUD). Avoids BullMQ connection errors. */
const noopWorker = {
	run: () => Promise.resolve(),
	close: () => Promise.resolve(),
	cancelJob: () => Promise.resolve(),
	cancelAllJobs: () => Promise.resolve(),
};

export const deploymentWorker = !IS_CLOUD
	? createDeploymentWorker()
	: (noopWorker as unknown as Worker<DeploymentJob>);
