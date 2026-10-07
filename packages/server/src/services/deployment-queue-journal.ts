import { appendFile } from "node:fs/promises";
import { db } from "@dokploy/server/db";
import {
	type DeploymentQueueJobRow,
	deployments,
	deploymentQueueJobs,
} from "@dokploy/server/db/schema";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Persistence for the deployment queue journal (table `deployment_queue_job`).
 *
 * The in-memory queue is the executor; these helpers are the durable record of
 * what it still owes. They are plain DB operations and DO throw: the caller
 * (apps/dokploy/server/queues/queue-journal.ts) is responsible for isolating
 * failures so a journal problem can never block a deploy.
 */

export type QueueJobPayload = Record<string, unknown>;
export type QueueJobState = "waiting" | "active";

export const INTERRUPTED_DEPLOYMENT_MESSAGE =
	"Interrupted by a Dokploy restart; re-queued";

export const insertQueueJob = async (
	jobId: string,
	payload: QueueJobPayload,
) => {
	await db
		.insert(deploymentQueueJobs)
		.values({ jobId, payload, state: "waiting" })
		// A retried insert (same journal id) must not fail the enqueue.
		.onConflictDoNothing();
};

export const markQueueJobActive = async (jobId: string) => {
	await db
		.update(deploymentQueueJobs)
		.set({ state: "active", startedAt: new Date() })
		.where(eq(deploymentQueueJobs.jobId, jobId));
};

export const deleteQueueJobs = async (jobIds: string[]) => {
	if (jobIds.length === 0) return;
	await db
		.delete(deploymentQueueJobs)
		.where(inArray(deploymentQueueJobs.jobId, jobIds));
};

/** Every journaled job, oldest first (insertion order). */
export const listQueueJobs = (): Promise<DeploymentQueueJobRow[]> =>
	db.select().from(deploymentQueueJobs).orderBy(asc(deploymentQueueJobs.seq));

/**
 * Put jobs that were `active` when the process died back to `waiting` and count
 * the attempt, so a job that keeps crashing the instance can be given up on.
 */
export const requeueInterruptedQueueJobs = async (jobIds: string[]) => {
	if (jobIds.length === 0) return;
	await db
		.update(deploymentQueueJobs)
		.set({
			state: "waiting",
			startedAt: null,
			attempts: sql`${deploymentQueueJobs.attempts} + 1`,
		})
		.where(inArray(deploymentQueueJobs.jobId, jobIds));
};

const str = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

/**
 * The `deployment` rows a queue job produces, as a drizzle condition: the
 * service's own deploys (not its schedules/backups) that are still `running`.
 */
const runningDeploymentsOf = (payload: QueueJobPayload) => {
	const previewDeploymentId = str(payload.previewDeploymentId);
	const applicationId = str(payload.applicationId);
	const composeId = str(payload.composeId);

	let owner = null;
	if (previewDeploymentId) {
		owner = eq(deployments.previewDeploymentId, previewDeploymentId);
	} else if (payload.applicationType === "compose" && composeId) {
		owner = and(
			eq(deployments.composeId, composeId),
			isNull(deployments.previewDeploymentId),
		);
	} else if (applicationId) {
		owner = and(
			eq(deployments.applicationId, applicationId),
			isNull(deployments.previewDeploymentId),
		);
	}
	if (!owner) return null;

	return and(
		eq(deployments.status, "running"),
		owner,
		isNull(deployments.scheduleId),
		isNull(deployments.backupId),
		isNull(deployments.volumeBackupId),
	);
};

const appendLogLine = async (
	logPath: string,
	serverId: string | null,
	line: string,
) => {
	if (!logPath || logPath === ".") return;
	if (serverId) {
		await execAsyncRemote(
			serverId,
			`printf '%s\\n' '${line.replace(/'/g, "")}' >> "${logPath}"`,
		);
		return;
	}
	await appendFile(logPath, `${line}\n`);
};

/**
 * For jobs that were `active` when the previous process died: close the
 * `deployment` row that was left `running` as an error and write a clear line
 * into its log. Returns how many deployment rows were closed.
 *
 * Must run BEFORE `initCancelDeployments`, which turns every leftover
 * `running` deployment into `cancelled` (and the service into `idle`).
 * Never throws.
 */
export const markInterruptedQueueDeployments = async (
	activeJobs: Array<Pick<DeploymentQueueJobRow, "payload">>,
): Promise<number> => {
	let closed = 0;
	for (const job of activeJobs) {
		try {
			const where = runningDeploymentsOf(job.payload);
			if (!where) continue;
			const rows = await db
				.update(deployments)
				.set({
					status: "error",
					errorMessage: INTERRUPTED_DEPLOYMENT_MESSAGE,
					finishedAt: new Date().toISOString(),
				})
				.where(where)
				.returning({
					logPath: deployments.logPath,
					serverId: deployments.serverId,
					buildServerId: deployments.buildServerId,
				});
			closed += rows.length;
			for (const row of rows) {
				try {
					await appendLogLine(
						row.logPath,
						row.buildServerId ?? row.serverId ?? null,
						INTERRUPTED_DEPLOYMENT_MESSAGE,
					);
				} catch (error) {
					console.error(
						"Could not write the restart note to the deployment log",
						error instanceof Error ? error.message : error,
					);
				}
			}
		} catch (error) {
			console.error("Could not mark an interrupted deployment", error);
		}
	}
	return closed;
};

// Marking must happen exactly once per process and before initCancelDeployments
// (see above). The flag lives on globalThis because this module can be loaded
// twice (server bundle and Next chunks).
const MARKED_SLOT = Symbol.for("dokploy.interruptedQueueDeploymentsMarked");

/**
 * Closes the deployments of journal jobs that were `active` at crash time.
 * Idempotent per process; called from `initCancelDeployments` (production boot)
 * and again by the queue restore as a fallback (dev, or if that step failed).
 * Never throws.
 */
export const markInterruptedFromJournal = async (): Promise<number> => {
	const registry = globalThis as unknown as Record<symbol, boolean | undefined>;
	if (registry[MARKED_SLOT]) return 0;
	registry[MARKED_SLOT] = true;
	try {
		const rows = await listQueueJobs();
		const active = rows.filter((row) => row.state === "active");
		if (active.length === 0) return 0;
		const closed = await markInterruptedQueueDeployments(active);
		console.log(
			`Marked ${closed} deployment(s) interrupted by the restart (${active.length} active queue job(s))`,
		);
		return closed;
	} catch (error) {
		// Table missing (migration failed) or DB down: nothing to mark.
		console.error("Could not read the deployment queue journal", error);
		registry[MARKED_SLOT] = false;
		return 0;
	}
};
