import { db } from "@dokploy/server/db";
import { pendingGithubDeployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

export type PendingGithubDeployment =
	typeof pendingGithubDeployments.$inferSelect;

type CreatePendingGithubDeployment = {
	headSha: string;
	titleLog: string;
	descriptionLog: string;
} & ({ applicationId: string } | { composeId: string });

export const createPendingGithubDeployment = async (
	input: CreatePendingGithubDeployment,
) => {
	const sameService =
		"applicationId" in input
			? eq(pendingGithubDeployments.applicationId, input.applicationId)
			: eq(pendingGithubDeployments.composeId, input.composeId);

	// Only the latest push of a service is worth deploying, so an older
	// parked deploy is dropped rather than left to fire on stale checks.
	await db.delete(pendingGithubDeployments).where(sameService);

	const [created] = await db
		.insert(pendingGithubDeployments)
		.values(input)
		.returning();

	return created;
};

export const findPendingGithubDeploymentsBySha = (headSha: string) =>
	db.query.pendingGithubDeployments.findMany({
		where: eq(pendingGithubDeployments.headSha, headSha),
		with: {
			application: {
				columns: { applicationId: true, githubId: true, serverId: true },
			},
			compose: {
				columns: { composeId: true, githubId: true, serverId: true },
			},
		},
	});

export const removePendingGithubDeployment = async (
	pendingGithubDeploymentId: string,
) => {
	const [removed] = await db
		.delete(pendingGithubDeployments)
		.where(
			eq(
				pendingGithubDeployments.pendingGithubDeploymentId,
				pendingGithubDeploymentId,
			),
		)
		.returning();

	return removed;
};
