import { type Job, Worker } from "bullmq";
import {
	deployApplication,
	rebuildApplication,
	updateApplicationStatus,
} from "../api/services/application";
import { myQueue, redisConfig } from "./queueSetup";
import {
	deployCompose,
	rebuildCompose,
	updateCompose,
} from "../api/services/compose";

type DeployJob =
	| {
			applicationId: string;
			titleLog: string;
			descriptionLog: string;
			type: "deploy" | "redeploy";
			applicationType: "application";
	  }
	| {
			composeId: string;
			titleLog: string;
			descriptionLog: string;
			type: "deploy" | "redeploy";
			applicationType: "compose";
	  };

export type DeploymentJob = DeployJob;

export const deploymentWorker = new Worker(
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

export const cleanQueuesByApplication = async (applicationId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.applicationId === applicationId) {
			await job.remove();
			console.log(`Removed job ${job.id} for application ${applicationId}`);
		}
	}
};

export const cleanQueuesByCompose = async (composeId: string) => {
	const jobs = await myQueue.getJobs(["waiting", "delayed"]);

	for (const job of jobs) {
		if (job?.data?.composeId === composeId) {
			await job.remove();
			console.log(`Removed job ${job.id} for compose ${composeId}`);
		}
	}
};
