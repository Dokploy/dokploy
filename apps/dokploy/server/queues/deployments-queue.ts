import {
	deployApplication,
	deployCompose,
	deployPreviewApplication,
	findApplicationById,
	findComposeById,
	findPreviewDeploymentById,
	rebuildApplication,
	rebuildCompose,
	rebuildPreviewApplication,
	updateApplicationStatus,
	updateCompose,
	updatePreviewDeployment,
} from "@dokploy/server";
import type { InMemoryJob } from "./in-memory-queue";
import type { DeploymentJob } from "./queue-types";

/**
 * Marks the service as failed when the job throws.
 *
 * The deploy/rebuild helpers already set the status to `error` on their own
 * failure path, but anything that throws outside of it (resolving the service,
 * creating the deployment row, an unreachable server while writing the error
 * log) would otherwise leave the service pinned to the `running` status set at
 * the start of the job, with no way to clear it from the UI.
 *
 * The status is only rolled back while it is still `running`. A helper that
 * already wrote `done` or `error` keeps its own result, so a late throw (the
 * commit metadata write in the helper's `finally` block, for example) cannot
 * relabel a successful deployment as failed.
 */
const markJobAsFailed = async (data: DeploymentJob) => {
	try {
		if (data.applicationType === "application") {
			const application = await findApplicationById(data.applicationId);
			if (application.applicationStatus !== "running") {
				return;
			}
			await updateApplicationStatus(data.applicationId, "error");
		} else if (data.applicationType === "compose") {
			const compose = await findComposeById(data.composeId);
			if (compose.composeStatus !== "running") {
				return;
			}
			await updateCompose(data.composeId, {
				composeStatus: "error",
			});
		} else if (data.applicationType === "application-preview") {
			const previewDeployment = await findPreviewDeploymentById(
				data.previewDeploymentId,
			);
			if (previewDeployment.previewStatus !== "running") {
				return;
			}
			await updatePreviewDeployment(data.previewDeploymentId, {
				previewStatus: "error",
			});
		}
	} catch (error) {
		console.log("Error resetting the deployment status", error);
	}
};

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
		await markJobAsFailed(job.data);
	}
};
