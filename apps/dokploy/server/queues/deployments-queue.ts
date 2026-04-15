import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	findPreviewDeploymentRecordById,
	rebuildApplication,
	rebuildCompose,
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
};
