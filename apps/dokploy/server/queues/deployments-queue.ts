import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updateDeploymentStatus,
	updatePreviewDeployment,
} from "@dokploy/server";
import type { InMemoryJob } from "./in-memory-queue";

/**
 * Processes a single deployment job. Shared by the in-memory queue worker and
 * (in cloud) the direct background execution path.
 */
export const processDeploymentJob = async (job: InMemoryJob) => {
	try {
		if (job.data.applicationType === "application") {
			if (!job.data.deploymentId) {
				await updateApplicationStatus(job.data.applicationId, "running");
			}

			if (job.data.type === "redeploy") {
				await rebuildApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					deploymentId: job.data.deploymentId,
				});
			} else if (job.data.type === "deploy") {
				await deployApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					deploymentId: job.data.deploymentId,
				});
			}
		} else if (job.data.applicationType === "compose") {
			if (!job.data.deploymentId) {
				await updateCompose(job.data.composeId, {
					composeStatus: "running",
				});
			}
			if (job.data.type === "deploy") {
				await deployCompose({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					freshVolumes: job.data.freshVolumes,
					deploymentId: job.data.deploymentId,
				});
			} else if (job.data.type === "redeploy") {
				await rebuildCompose({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					freshVolumes: job.data.freshVolumes,
					deploymentId: job.data.deploymentId,
				});
			}
		} else if (job.data.applicationType === "application-preview") {
			if (!job.data.deploymentId) {
				await updatePreviewDeployment(job.data.previewDeploymentId, {
					previewStatus: "running",
				});
			}

			if (job.data.type === "redeploy") {
				await rebuildPreviewApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
					deploymentId: job.data.deploymentId,
				});
			} else if (job.data.type === "deploy") {
				await deployPreviewApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
					deploymentId: job.data.deploymentId,
				});
			}
		}
	} catch (error) {
		console.error("Deployment job failed", error);
		try {
			if (job.data.deploymentId) {
				await updateDeploymentStatus(job.data.deploymentId, "error");
			}
			if (job.data.applicationType === "application") {
				await updateApplicationStatus(job.data.applicationId, "error");
			} else if (job.data.applicationType === "compose") {
				await updateCompose(job.data.composeId, { composeStatus: "error" });
			} else if (job.data.applicationType === "application-preview") {
				await updatePreviewDeployment(job.data.previewDeploymentId, {
					previewStatus: "error",
				});
			}
		} catch (cleanupError) {
			console.error("Failed to update status after job failure", cleanupError);
		}
	}
};
