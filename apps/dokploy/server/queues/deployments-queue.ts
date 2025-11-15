import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	rebuildApplication,
	rebuildCompose,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import type { DeploymentJob } from "./queue-types";
import { myQueue } from "./queueSetup";

// Set the handler for processing deployment jobs
console.log("Setting deployment queue handler");
myQueue.setHandler(async (job: DeploymentJob) => {
	const jobId =
		job.applicationType === "application"
			? job.applicationId
			: job.applicationType === "compose"
				? job.composeId
				: job.previewDeploymentId;
	console.log("Handler called with job:", job.applicationType, jobId);
	try {
		if (job.applicationType === "application") {
			await updateApplicationStatus(job.applicationId, "running");

			if (job.type === "redeploy") {
				await rebuildApplication({
					applicationId: job.applicationId,
					titleLog: job.titleLog,
					descriptionLog: job.descriptionLog,
				});
			} else if (job.type === "deploy") {
				await deployApplication({
					applicationId: job.applicationId,
					titleLog: job.titleLog,
					descriptionLog: job.descriptionLog,
				});
			}
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "running",
			});
			if (job.type === "deploy") {
				await deployCompose({
					composeId: job.composeId,
					titleLog: job.titleLog,
					descriptionLog: job.descriptionLog,
				});
			} else if (job.type === "redeploy") {
				await rebuildCompose({
					composeId: job.composeId,
					titleLog: job.titleLog,
					descriptionLog: job.descriptionLog,
				});
			}
		} else if (job.applicationType === "application-preview") {
			await updatePreviewDeployment(job.previewDeploymentId, {
				previewStatus: "running",
			});

			if (job.type === "deploy") {
				await deployPreviewApplication({
					applicationId: job.applicationId,
					titleLog: job.titleLog,
					descriptionLog: job.descriptionLog,
					previewDeploymentId: job.previewDeploymentId,
				});
			}
		}
	} catch (error) {
		console.log("Error processing deployment job", error);
		throw error; // Re-throw to let the queue handle retries if needed
	}
});

// Export for compatibility (no longer needed but kept for imports)
export const deploymentWorker = {
	run: () => {
		// Queue starts processing automatically when jobs are added
		console.log("Deployment queue handler initialized");
	},
};
