import {
	applications,
	compose,
	deployments,
	schedules,
} from "@dokploy/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");

		const runningDeployments = await db
			.select({
				deploymentId: deployments.deploymentId,
				scheduleId: deployments.scheduleId,
				scheduleType: schedules.scheduleType,
			})
			.from(deployments)
			.leftJoin(schedules, eq(deployments.scheduleId, schedules.scheduleId))
			.where(eq(deployments.status, "running"));

		const deploymentIdsToCancel = runningDeployments
			.filter(
				(deployment) =>
					!deployment.scheduleId ||
					deployment.scheduleType === "dokploy-server",
			)
			.map((deployment) => deployment.deploymentId);

		if (deploymentIdsToCancel.length === 0) {
			console.log("Cancelled 0 deployments");
			return;
		}

		const result = await db
			.update(deployments)
			.set({
				status: "cancelled",
			})
			.where(inArray(deployments.deploymentId, deploymentIdsToCancel))
			.returning();

		const applicationIds = [
			...new Set(
				result
					.map((deployment) => deployment.applicationId)
					.filter((id): id is string => !!id),
			),
		];
		const composeIds = [
			...new Set(
				result
					.map((deployment) => deployment.composeId)
					.filter((id): id is string => !!id),
			),
		];

		if (applicationIds.length > 0) {
			await db
				.update(applications)
				.set({ applicationStatus: "idle" })
				.where(inArray(applications.applicationId, applicationIds));
		}

		if (composeIds.length > 0) {
			await db
				.update(compose)
				.set({ composeStatus: "idle" })
				.where(inArray(compose.composeId, composeIds));
		}

		console.log(`Cancelled ${result.length} deployments`);
	} catch (error) {
		console.error(error);
	}
};
