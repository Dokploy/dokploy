import {
	deployRemoteApplication,
	deployRemoteCompose,
	deployRemotePreviewApplication,
	rebuildRemoteApplication,
	rebuildRemoteCompose,
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
					await rebuildRemoteApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				} else if (job.type === "deploy") {
					await deployRemoteApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				}
			}
		} else if (job.applicationType === "compose") {
			await updateCompose(job.composeId, {
				composeStatus: "running",
			});

			if (job.server) {
				if (job.type === "redeploy") {
					await rebuildRemoteCompose({
						composeId: job.composeId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				} else if (job.type === "deploy") {
					await deployRemoteCompose({
						composeId: job.composeId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
					});
				}
			}
		} else if (job.applicationType === "application-preview") {
			await updatePreviewDeployment(job.previewDeploymentId, {
				previewStatus: "running",
			});
			if (job.server) {
				if (job.type === "deploy") {
					await deployRemotePreviewApplication({
						applicationId: job.applicationId,
						titleLog: job.titleLog,
						descriptionLog: job.descriptionLog,
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
