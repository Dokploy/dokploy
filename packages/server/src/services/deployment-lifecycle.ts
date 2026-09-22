import { db } from "@dokploy/server/db";
import {
	type ApplicationStatus,
	applications,
	compose,
	deployments,
	previewDeployments,
} from "@dokploy/server/db/schema";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { DeploymentJob } from "../queues/deployment-job";

type Deployment = typeof deployments.$inferSelect;
type DeploymentOwner = Pick<
	Deployment,
	"applicationId" | "composeId" | "previewDeploymentId"
>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const getOwner = (deployment: DeploymentOwner) => {
	if (deployment.previewDeploymentId) {
		return {
			table: previewDeployments,
			idColumn: previewDeployments.previewDeploymentId,
			id: deployment.previewDeploymentId,
			condition: eq(
				deployments.previewDeploymentId,
				deployment.previewDeploymentId,
			),
		};
	}
	if (deployment.applicationId) {
		return {
			table: applications,
			idColumn: applications.applicationId,
			id: deployment.applicationId,
			condition: eq(deployments.applicationId, deployment.applicationId),
		};
	}
	if (deployment.composeId) {
		return {
			table: compose,
			idColumn: compose.composeId,
			id: deployment.composeId,
			condition: eq(deployments.composeId, deployment.composeId),
		};
	}
	return null;
};

// Lock the service before changing any attempt. This serializes aggregate status
// updates across both the web process and the remote deployment workers.
const withDeploymentOwner = async <T>(
	deployment: DeploymentOwner,
	mutate: (tx: Transaction) => Promise<T>,
	fallbackStatus: ApplicationStatus,
) =>
	db.transaction(async (tx) => {
		const owner = getOwner(deployment);
		if (owner) {
			await tx.execute(sql`
				select ${owner.idColumn} from ${owner.table}
				where ${owner.idColumn} = ${owner.id} for update
			`);
		}

		const result = await mutate(tx);
		if (!owner || !result) return result;

		const [active] = await tx
			.select({ status: deployments.status })
			.from(deployments)
			.where(
				and(
					owner.condition,
					inArray(deployments.status, ["running", "queued"]),
				),
			)
			.orderBy(
				sql`case when ${deployments.status} = 'running' then 0 else 1 end`,
			)
			.limit(1);
		const status =
			active?.status === "running" || active?.status === "queued"
				? active.status
				: fallbackStatus;

		if (deployment.previewDeploymentId) {
			await tx
				.update(previewDeployments)
				.set({ previewStatus: status })
				.where(
					eq(
						previewDeployments.previewDeploymentId,
						deployment.previewDeploymentId,
					),
				);
		} else if (deployment.applicationId) {
			await tx
				.update(applications)
				.set({ applicationStatus: status })
				.where(eq(applications.applicationId, deployment.applicationId));
		} else if (deployment.composeId) {
			await tx
				.update(compose)
				.set({ composeStatus: status })
				.where(eq(compose.composeId, deployment.composeId));
		}
		return result;
	});

export const queueDeployment = async (job: DeploymentJob) => {
	const owner: DeploymentOwner = {
		applicationId:
			job.applicationType === "application" ? job.applicationId : null,
		composeId: job.applicationType === "compose" ? job.composeId : null,
		previewDeploymentId:
			job.applicationType === "application-preview"
				? job.previewDeploymentId
				: null,
	};
	return withDeploymentOwner(
		owner,
		async (tx) => {
			const [deployment] = await tx
				.insert(deployments)
				.values({
					...owner,
					title: job.titleLog || "Deployment",
					description: job.descriptionLog,
					status: "queued",
					logPath: "",
				})
				.returning();
			if (!deployment) throw new Error("Failed to create queued deployment");
			return deployment;
		},
		"queued",
	);
};

const transitionDeployment = async (
	deploymentId: string,
	from: NonNullable<Deployment["status"]>[],
	status: NonNullable<Deployment["status"]>,
	errorMessage?: string,
	ownerCondition?: SQL,
) => {
	const deployment = await db.query.deployments.findFirst({
		where: and(eq(deployments.deploymentId, deploymentId), ownerCondition),
	});
	if (!deployment) return undefined;

	return withDeploymentOwner(
		deployment,
		async (tx) => {
			const [updated] = await tx
				.update(deployments)
				.set({
					status,
					...(status === "running"
						? { startedAt: new Date().toISOString() }
						: { finishedAt: new Date().toISOString() }),
					errorMessage,
				})
				.where(
					and(
						eq(deployments.deploymentId, deploymentId),
						inArray(deployments.status, from),
						ownerCondition,
					),
				)
				.returning();
			return updated;
		},
		status === "cancelled" ? "idle" : status,
	);
};

export const claimQueuedDeployment = (
	deploymentId: string,
	owner: DeploymentOwner,
) => {
	const service = getOwner(owner);
	if (!service) throw new Error("Deployment owner is required");
	return transitionDeployment(
		deploymentId,
		["queued"],
		"running",
		undefined,
		service.condition,
	);
};

export const finishDeployment = (
	deploymentId: string,
	status: "done" | "error",
	errorMessage?: string,
) => transitionDeployment(deploymentId, ["running"], status, errorMessage);

export const failQueuedDeployment = (deploymentId: string, error: unknown) =>
	transitionDeployment(
		deploymentId,
		["queued"],
		"error",
		error instanceof Error ? error.message : String(error),
	);

export const cancelQueuedDeployments = async (condition?: SQL) => {
	// Cancel only this snapshot. Enqueues after it must survive queue cleanup.
	const queued = await db.query.deployments.findMany({
		where: and(eq(deployments.status, "queued"), condition),
		columns: { deploymentId: true },
	});
	const cancelled: string[] = [];
	for (const { deploymentId } of queued) {
		if (await transitionDeployment(deploymentId, ["queued"], "cancelled")) {
			cancelled.push(deploymentId);
		}
	}
	return cancelled;
};

export const cancelStaleDeployment = (deploymentId: string) =>
	transitionDeployment(deploymentId, ["queued", "running"], "cancelled");
