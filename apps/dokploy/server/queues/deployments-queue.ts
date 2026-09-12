import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateDeploymentStatus,
	updateServiceStatusFromActiveDeployments,
} from "@dokploy/server";
import type { InMemoryJob } from "./in-memory-queue";
import { withServiceLock } from "./service-lock";

/**
 * Atomically updates service status after deployment completion by checking
 * for other active/queued deployments. Prevents race conditions where a
 * completing deployment overwrites the status while another deployment is queued.
 */
const updateServiceStatusAfterDeployment = async (
	job: InMemoryJob,
	terminalStatus: "done" | "error",
) => {
	const data = job.data;
	if (data.applicationType === "application") {
		const appId = data.applicationId;
		await withServiceLock(`application:${appId}`, async () => {
			await updateServiceStatusFromActiveDeployments(
				"applicationId",
				appId,
				terminalStatus,
			);
		});
	} else if (data.applicationType === "compose") {
		const composeId = data.composeId;
		await withServiceLock(`compose:${composeId}`, async () => {
			await updateServiceStatusFromActiveDeployments(
				"composeId",
				composeId,
				terminalStatus,
			);
		});
	} else if (data.applicationType === "application-preview") {
		const previewId = data.previewDeploymentId;
		await withServiceLock(`preview:${previewId}`, async () => {
			await updateServiceStatusFromActiveDeployments(
				"previewDeploymentId",
				previewId,
				terminalStatus,
			);
		});
	}
};

/**
 * Processes a single deployment job. Shared by the in-memory queue worker.
 *
 * Note: deploymentId is always present because deployment records are created
 * at enqueue time (not execution time) via enqueueApplicationDeployment/Compose/Preview.
 */
export const processDeploymentJob = async (job: InMemoryJob) => {
	try {
		if (job.data.applicationType === "application") {
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

		// After successful deployment, atomically update service status
		await updateServiceStatusAfterDeployment(job, "done");
	} catch (error) {
		console.error("Deployment job failed", error);
		try {
			if (job.data.deploymentId) {
				await updateDeploymentStatus(job.data.deploymentId, "error");
			}
			// Atomically update service status, checking for other active deployments
			await updateServiceStatusAfterDeployment(job, "error");
		} catch (cleanupError) {
			console.error("Failed to update status after job failure", cleanupError);
		}
	}
};
