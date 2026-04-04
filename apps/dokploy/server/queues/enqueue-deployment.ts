import {
	failQueuedDeployment,
	IS_CLOUD,
	queueApplicationDeployment,
	queueComposeDeployment,
	queuePreviewDeployment,
} from "@dokploy/server";
import { deploy } from "../utils/deploy";
import type { DeploymentJob } from "./queue-types";
import { myQueue } from "./queueSetup";

const attachQueuedDeployment = async (
	jobData: DeploymentJob,
): Promise<DeploymentJob> => {
	if (jobData.applicationType === "application") {
		const deployment = await queueApplicationDeployment({
			applicationId: jobData.applicationId,
			title: jobData.titleLog,
			description: jobData.descriptionLog,
		});

		return {
			...jobData,
			deploymentId: deployment.deploymentId,
		};
	}

	if (jobData.applicationType === "compose") {
		const deployment = await queueComposeDeployment({
			composeId: jobData.composeId,
			title: jobData.titleLog,
			description: jobData.descriptionLog,
		});

		return {
			...jobData,
			deploymentId: deployment.deploymentId,
		};
	}

	const deployment = await queuePreviewDeployment({
		previewDeploymentId: jobData.previewDeploymentId,
		title: jobData.titleLog,
		description: jobData.descriptionLog,
	});

	return {
		...jobData,
		deploymentId: deployment.deploymentId,
	};
};

export const enqueueDeploymentJob = async (jobData: DeploymentJob) => {
	const queuedJobData = await attachQueuedDeployment(jobData);

	try {
		if (IS_CLOUD && queuedJobData.serverId) {
			await deploy(queuedJobData);
			return queuedJobData;
		}

		await myQueue.add(
			"deployments",
			{ ...queuedJobData },
			{
				removeOnComplete: true,
				removeOnFail: true,
			},
		);

		return queuedJobData;
	} catch (error) {
		if (queuedJobData.deploymentId) {
			await failQueuedDeployment(queuedJobData.deploymentId, error);
		}

		throw error;
	}
};
