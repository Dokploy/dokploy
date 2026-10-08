import {
	deployApplication,
	deployCompose,
	deployComposePreview,
	// build-policy hook: see the pinnedImage branch below.
	deployPinnedApplicationImage,
	deployPreviewApplication,
	isDeploymentCancelledError,
	rebuildApplication,
	rebuildCompose,
	rebuildComposePreview,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
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
			await updateApplicationStatus(job.data.applicationId, "running");

			// >>> build-policy hook: deploy-hook supplied image, no build.
			// See packages/server/src/services/build-policy/README.md
			if (job.data.pinnedImage) {
				await deployPinnedApplicationImage({
					applicationId: job.data.applicationId,
					pinnedImage: job.data.pinnedImage,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
				});
			} else if (job.data.type === "redeploy") {
				// <<< build-policy hook
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
					freshVolumes: job.data.freshVolumes,
				});
			} else if (job.data.type === "redeploy") {
				await rebuildCompose({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					freshVolumes: job.data.freshVolumes,
				});
			}
		} else if (job.data.applicationType === "application-preview") {
			await updatePreviewDeployment(job.data.previewDeploymentId, {
				previewStatus: "running",
			});

			if (job.data.type === "redeploy") {
				await rebuildPreviewApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
				});
			} else if (job.data.type === "deploy") {
				await deployPreviewApplication({
					applicationId: job.data.applicationId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
				});
			}
		} else if (job.data.applicationType === "compose-preview") {
			await updatePreviewDeployment(job.data.previewDeploymentId, {
				previewStatus: "running",
			});

			if (job.data.type === "redeploy") {
				await rebuildComposePreview({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
				});
			} else if (job.data.type === "deploy") {
				await deployComposePreview({
					composeId: job.data.composeId,
					titleLog: job.data.titleLog,
					descriptionLog: job.data.descriptionLog,
					previewDeploymentId: job.data.previewDeploymentId,
				});
			}
		}
	} catch (error) {
		// A build-server deployment the user cancelled: the deploy flow already
		// recorded `cancelled` and put the service back to the state of the
		// release that is still serving, so it must not be flipped to "error".
		// Returning here ends the job normally, releasing its queue slot and the
		// service's group lock.
		if (isDeploymentCancelledError(error)) {
			console.log(`Deployment cancelled: ${(error as Error).message}`);
			return;
		}
		console.log("Error", error);
		// Roll back the status set at the start of the job so a failed deployment
		// does not leave the service stuck in "running".
		if (job.data.applicationType === "application") {
			await updateApplicationStatus(job.data.applicationId, "error").catch(
				() => {},
			);
		} else if (job.data.applicationType === "compose") {
			await updateCompose(job.data.composeId, {
				composeStatus: "error",
			}).catch(() => {});
		} else if (
			job.data.applicationType === "application-preview" ||
			job.data.applicationType === "compose-preview"
		) {
			await updatePreviewDeployment(job.data.previewDeploymentId, {
				previewStatus: "error",
			}).catch(() => {});
		}
	}
};
