import { applications, compose, deployments } from "@dokploy/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");

		const result = await db
			.update(deployments)
			.set({
				status: "cancelled",
			})
			.where(eq(deployments.status, "running"))
			.returning();

		// Reset the related services so they don't stay stuck in "running".
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
