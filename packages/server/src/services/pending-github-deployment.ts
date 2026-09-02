import { db } from "@dokploy/server/db";
import { pendingGithubDeployments } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

export type PendingGithubDeployment =
	typeof pendingGithubDeployments.$inferSelect;

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreatePendingGithubDeployment = {
	headSha: string;
	titleLog: string;
	descriptionLog: string;
} & ({ applicationId: string } | { composeId: string });

export const createPendingGithubDeployment = async (
	input: CreatePendingGithubDeployment,
) => {
	// Only the latest push of a service is worth deploying. The unique index
	// on the service id turns a second push into an update of the parked row,
	// so two overlapping webhooks cannot leave two deployable rows behind.
	const target =
		"applicationId" in input
			? pendingGithubDeployments.applicationId
			: pendingGithubDeployments.composeId;

	const [created] = await db
		.insert(pendingGithubDeployments)
		.values(input)
		.onConflictDoUpdate({
			target,
			set: {
				headSha: input.headSha,
				titleLog: input.titleLog,
				descriptionLog: input.descriptionLog,
				createdAt: new Date().toISOString(),
			},
		})
		.returning();

	return created;
};

export const findPendingGithubDeploymentsBySha = (headSha: string) =>
	db.query.pendingGithubDeployments.findMany({
		where: eq(pendingGithubDeployments.headSha, headSha),
		with: {
			application: {
				columns: {
					applicationId: true,
					githubId: true,
					serverId: true,
					owner: true,
					repository: true,
				},
			},
			compose: {
				columns: {
					composeId: true,
					githubId: true,
					serverId: true,
					owner: true,
					repository: true,
				},
			},
		},
	});

export const removePendingGithubDeployment = async (
	pendingGithubDeploymentId: string,
	executor: Executor = db,
) => {
	const [removed] = await executor
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
