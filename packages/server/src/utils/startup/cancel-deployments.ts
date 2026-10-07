import {
	applications,
	compose,
	deployments,
	schedules,
} from "@dokploy/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index";
import { markInterruptedFromJournal } from "../../services/deployment-queue-journal";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");

		// Deployments whose queue job was active when the previous process died are
		// closed as "Interrupted by a Dokploy restart; re-queued" (error) before
		// the sweep below would label them "cancelled": the queue restore re-runs
		// those jobs, so "cancelled" would be misleading.
		await markInterruptedFromJournal();

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
