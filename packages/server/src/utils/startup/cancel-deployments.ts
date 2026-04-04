import { deployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { db } from "../../db/index";

export const initCancelDeployments = async () => {
	try {
		console.log("Setting up cancel deployments....");
		const cancelledAt = new Date().toISOString();

		const result = await db
			.update(deployments)
			.set({
				status: "cancelled",
				finishedAt: cancelledAt,
			})
			.where(eq(deployments.status, "running"))
			.returning();

		console.log(`Cancelled ${result.length} deployments`);
	} catch (error) {
		console.error(error);
	}
};
