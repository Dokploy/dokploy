import { deployments, schedules } from "@dokploy/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index";
import { cancelStaleDeployment } from "../../services/deployment-lifecycle";

// Called before the self-hosted server accepts requests or starts its workers.
// Remote scheduled tasks can still be executing and must remain untouched.
export const initCancelDeployments = async () => {
	const stale = await db
		.select({
			deploymentId: deployments.deploymentId,
			scheduleId: deployments.scheduleId,
			scheduleType: schedules.scheduleType,
		})
		.from(deployments)
		.leftJoin(schedules, eq(deployments.scheduleId, schedules.scheduleId))
		.where(inArray(deployments.status, ["queued", "running"]));
	let cancelled = 0;
	for (const deployment of stale) {
		if (deployment.scheduleId && deployment.scheduleType !== "dokploy-server")
			continue;
		if (await cancelStaleDeployment(deployment.deploymentId)) cancelled++;
	}
	console.log(`Cancelled ${cancelled} interrupted deployments`);
};
