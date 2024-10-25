import {
	deployApplication,
	deployCompose,
	deployRemoteApplication,
	deployRemoteCompose,
	rebuildApplication,
	rebuildCompose,
	rebuildRemoteApplication,
	rebuildRemoteCompose,
	updateApplicationStatus,
	updateCompose,
} from "@dokploy/server";
import { type Job, Worker } from "bullmq";
import type { DeploymentJob } from "./queue-types";
import { redisConfig } from "./redis-connection";

export const deploymentWorker = new Worker(
	"deployments",
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
