import {
	acknowledgeDeploymentDispatches,
	findPendingDeploymentDispatches,
} from "@dokploy/server";
import type { Inngest } from "inngest";
import { deployJobSchema } from "./schema.js";

export const dispatchDeployments = async (
	inngest: Inngest,
	deploymentId?: string,
) => {
	const pending = await findPendingDeploymentDispatches(deploymentId);
	if (pending.length === 0) return 0;

	await inngest.send(
		pending.map(({ deploymentId, job }) => ({
			id: `deployment/requested:${deploymentId}`,
			name: "deployment/requested",
			data: deployJobSchema.parse({ ...job, deploymentId }),
		})),
	);
	// A crash before this acknowledgement replays the same event IDs. The
	// worker's atomic claim also prevents duplicate execution after dedup expires.
	await acknowledgeDeploymentDispatches(
		pending.map(({ deploymentId }) => deploymentId),
	);
	return pending.length;
};
