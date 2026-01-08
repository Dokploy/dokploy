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
import type { DeployJob } from "./schema";

export const deploy = async (job: DeployJob) => {
	try {
		if (job.applicationType === "application") {
			await updateApplicationStatus(job.applicationId, "running");
			if (job.server) {
				if (job.type === "redeploy") {
					await rebuildApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog || "Rebuild deployment",
						descriptionLog: job.descriptionLog || "",
					});
				} else if (job.type === "deploy") {
					await deployApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog || "Manual deployment",
						descriptionLog: job.descriptionLog || "",
					});
				}
			}
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "running",
			});

			if (job.server) {
				if (job.type === "redeploy") {
					await rebuildCompose({
						composeId: job.composeId,
						titleLog: job.titleLog || "Rebuild deployment",
						descriptionLog: job.descriptionLog || "",
					});
				} else if (job.type === "deploy") {
					await deployCompose({
						composeId: job.composeId,
						titleLog: job.titleLog || "Manual deployment",
						descriptionLog: job.descriptionLog || "",
					});
				}
			}
		} else if (job.applicationType === "application-preview") {
			await updatePreviewDeployment(job.previewDeploymentId, {
				previewStatus: "running",
			});
			if (job.server) {
				if (job.type === "deploy") {
					await deployPreviewApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog || "Preview Deployment",
						descriptionLog: job.descriptionLog || "",
						previewDeploymentId: job.previewDeploymentId,
					});
				}
			}
		}
	} catch (e) {
		if (job.applicationType === "application") {
			await updateApplicationStatus(job.applicationId, "error");
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "error",
			});
		} else if (job.applicationType === "application-preview") {
			await updatePreviewDeployment(job.previewDeploymentId, {
				previewStatus: "error",
			});
		}

		throw e;
	}

	return true;
};
