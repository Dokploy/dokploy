import { cancelDeploymentsByStatus } from "../../services/deployment";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");
		const result = await cancelDeploymentsByStatus(["running", "queued"]);

		console.log(`Cancelled ${result.length} deployments`);
	} catch (error) {
		console.error(error);
	}
};
