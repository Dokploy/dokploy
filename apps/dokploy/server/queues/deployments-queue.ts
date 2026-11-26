import {
	composeScaleLockKey,
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
	withDeployLock,
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
			const data = job.data;
			const { composeId } = data;
			// Live scaling runs `docker compose` / `docker service update` on the
			// same services; the lock keeps the two from interleaving.
			await withDeployLock(composeScaleLockKey(composeId), async () => {
				await updateCompose(composeId, {
					composeStatus: "running",
				});
				if (data.type === "deploy") {
					await deployCompose({
						composeId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
						freshVolumes: data.freshVolumes,
					});
				} else if (data.type === "redeploy") {
					await rebuildCompose({
						composeId,
						titleLog: data.titleLog,
						descriptionLog: data.descriptionLog,
						freshVolumes: data.freshVolumes,
					});
				}
			});
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
		}
	} catch (error) {
		console.log("Error", error);
	}
};
