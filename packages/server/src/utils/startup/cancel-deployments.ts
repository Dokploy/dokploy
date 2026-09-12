import { deployments, schedules } from "@dokploy/server/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { db } from "../../db/index";
import { updateServiceStatusFromActiveDeployments } from "../../services/deployment";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");

		const runningDeployments = await db
			.select({
				deploymentId: deployments.deploymentId,
				previewDeploymentId: deployments.previewDeploymentId,
				scheduleId: deployments.scheduleId,
				scheduleType: schedules.scheduleType,
			})
			.from(deployments)
			.leftJoin(schedules, eq(deployments.scheduleId, schedules.scheduleId))
			.where(
				or(eq(deployments.status, "running"), eq(deployments.status, "queued")),
			);

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
				finishedAt: new Date().toISOString(),
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

		// Recompute aggregate status for each affected service instead of blindly setting to "idle"
		// This prevents hiding other active/queued deployments that weren't cancelled
		if (applicationIds.length > 0) {
			for (const appId of applicationIds) {
				await updateServiceStatusFromActiveDeployments("applicationId", appId);
			}
		}

		if (composeIds.length > 0) {
			for (const composeId of composeIds) {
				await updateServiceStatusFromActiveDeployments("composeId", composeId);
			}
		}

		const previewDeploymentIds = [
			...new Set(
				result
					.map((deployment) => deployment.previewDeploymentId)
					.filter((id): id is string => !!id),
			),
		];

		if (previewDeploymentIds.length > 0) {
			for (const previewId of previewDeploymentIds) {
				await updateServiceStatusFromActiveDeployments(
					"previewDeploymentId",
					previewId,
				);
			}
		}

		console.log(`Cancelled ${result.length} deployments`);
	} catch (error) {
		console.error(error);
	}
};
