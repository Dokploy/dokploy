import type { DeploymentJob } from "../queues/queue-types";

export const getPreviewDeploymentJobType = (
	hasExistingPreviewDeployment: boolean,
): DeploymentJob["type"] => {
	return hasExistingPreviewDeployment ? "redeploy" : "deploy";
};
