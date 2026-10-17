import {
	deployApplication,
	deployPreviewApplication,
	rebuildApplication,
	rebuildPreviewApplication,
} from "../services/application";
import { deployCompose, rebuildCompose } from "../services/compose";
import { failDeploymentJob } from "../services/deployment-lifecycle";
import type { QueuedDeploymentJob } from "./deployment-job";

export const executeDeployment = async (
	job: QueuedDeploymentJob,
): Promise<boolean> => {
	try {
		switch (job.applicationType) {
			case "application":
				return await (job.type === "deploy"
					? deployApplication(job)
					: rebuildApplication(job));
			case "compose":
				return await (job.type === "deploy"
					? deployCompose(job)
					: rebuildCompose(job));
			case "application-preview":
				return await (job.type === "deploy"
					? deployPreviewApplication(job)
					: rebuildPreviewApplication(job));
		}
	} catch (error) {
		await failDeploymentJob(job, error);
		throw error;
	}
};
