import { db } from "@dokploy/server/db";
import { previewDeployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { removeService } from "../docker/utils";
import { type ApplicationNested, mechanizeDockerContainer } from ".";

const previewDeploymentExists = async (previewDeploymentId: string) => {
	const previewDeployment = await db.query.previewDeployments.findFirst({
		where: eq(previewDeployments.previewDeploymentId, previewDeploymentId),
		columns: { previewDeploymentId: true },
	});
	return !!previewDeployment;
};

/**
 * Creates or updates the preview's Swarm service, unless the preview was torn
 * down (e.g. PR closed) while the build was running. Returns false in that case.
 */
export const mechanizePreviewDockerContainer = async (
	application: ApplicationNested,
	previewDeploymentId: string,
) => {
	if (!(await previewDeploymentExists(previewDeploymentId))) {
		return false;
	}

	await mechanizeDockerContainer(application);

	// Teardown may have run while the service was being created
	if (!(await previewDeploymentExists(previewDeploymentId))) {
		await removeService(application.appName, application.serverId);
		return false;
	}

	return true;
};
