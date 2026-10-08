import { appendFile } from "node:fs/promises";
import { db } from "@dokploy/server/db";
import { compose, deployments } from "@dokploy/server/db/schema";
import {
	getKillRemoteBuildCommand,
	getRemoteBuildCancelTarget,
	parseKillResult,
	type RemoteBuildKillResult,
} from "@dokploy/server/utils/builders/remote-build-cancel";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import {
	abortRemoteBuild,
	hasRunningRemoteBuild,
} from "@dokploy/server/utils/process/remote-build-registry";
import { and, eq } from "drizzle-orm";

/**
 * Cancelling a deployment whose build runs on a build server.
 *
 * `docker build` / `docker compose` there run in their own session with a pid
 * file (see `utils/builders/remote-build-cancel.ts`), so a cancel signals that
 * one deployment's process group and nothing else. The deployment row is the
 * source of truth for "this was cancelled": the cancel flips it from `running`
 * to `cancelled` before it kills anything, and every step of the deploy flow
 * checks it, so a cancel that lands between two steps (for example between the
 * image push and the serving host's pull) still stops the deploy.
 */

/**
 * Thrown by a deploy flow whose deployment was cancelled. Recognised by a
 * property rather than `instanceof`, because the app can load this module
 * twice (see `utils/process/remote-build-registry.ts`).
 */
export class DeploymentCancelledError extends Error {
	readonly deploymentCancelled = true;

	constructor(message = "Deployment cancelled.") {
		super(message);
		this.name = "DeploymentCancelledError";
	}
}

export const isDeploymentCancelledError = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	(error as { deploymentCancelled?: unknown }).deploymentCancelled === true;

/**
 * True once the deployment has been marked cancelled. A failed lookup counts
 * as "not cancelled": the check runs inside the deploy flow (including its
 * failure path), where it must never replace the real error or fail a deploy
 * that nobody cancelled.
 */
export const isDeploymentCancelled = async (
	deploymentId: string | undefined,
): Promise<boolean> => {
	if (!deploymentId) return false;
	try {
		const row = await db.query.deployments.findFirst({
			where: eq(deployments.deploymentId, deploymentId),
			columns: { status: true },
		});
		return row?.status === "cancelled";
	} catch (error) {
		console.warn(
			`Could not read the cancel flag of deployment ${deploymentId}:`,
			error instanceof Error ? error.message : error,
		);
		return false;
	}
};

/**
 * The status a service returns to after a cancelled deploy. Nothing from the
 * cancelled build was pulled or started, so a service that has deployed before
 * is still serving its last release ("done"); one that never has stays "idle".
 */
export const statusAfterCancelledDeploy = async (
	service: { applicationId: string } | { composeId: string },
): Promise<"done" | "idle"> => {
	const owner =
		"applicationId" in service
			? eq(deployments.applicationId, service.applicationId)
			: eq(deployments.composeId, service.composeId);
	const previous = await db.query.deployments.findFirst({
		where: and(owner, eq(deployments.status, "done")),
		columns: { deploymentId: true },
	});
	return previous ? "done" : "idle";
};

/** Throws `DeploymentCancelledError` when the deployment was cancelled. */
export const assertDeploymentNotCancelled = async (
	deploymentId: string | undefined,
) => {
	if (await isDeploymentCancelled(deploymentId)) {
		throw new DeploymentCancelledError(
			"Deployment cancelled: nothing more will be built, pushed or deployed.",
		);
	}
};

/**
 * Runs an application's build script on `serverId`. When the build runs on a
 * build server (the deployment recorded one) it is launched cancelable, in its
 * own session with a pid file, so `application.killBuild` can stop exactly this
 * deployment's build there. Any other command is sent exactly as before.
 */
export const runRemoteBuildScript = async (
	serverId: string,
	commandWithLog: string,
	deployment: { deploymentId: string; buildServerId?: string | null },
) => {
	if (!deployment.buildServerId) {
		await execAsyncRemote(serverId, commandWithLog);
		return;
	}
	await assertDeploymentNotCancelled(deployment.deploymentId);
	await execAsyncRemote(serverId, commandWithLog, undefined, {
		cancelable: getRemoteBuildCancelTarget(deployment.deploymentId),
	});
};

/**
 * After the build script ended, a build-server deployment that was cancelled
 * meanwhile (the cancel landed once the build was already done, so there was
 * nothing to kill) must not go on to pull and run the image.
 */
export const assertBuildNotCancelled = async (deployment: {
	deploymentId: string;
	buildServerId?: string | null;
}) => {
	if (deployment.buildServerId) {
		await assertDeploymentNotCancelled(deployment.deploymentId);
	}
};

/** Longest a cancel waits for the build server's kill script (SSH included). */
export const KILL_TIMEOUT_MS = 30_000;
/** The pid file is written a moment after the ssh command starts. */
const PID_FILE_RETRY_MS = 1_000;
const PID_FILE_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${what} did not answer within ${ms / 1000}s`)),
			ms,
		);
	});
	// The loser keeps running; make sure its failure is not unhandled.
	promise.catch(() => {});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/** Appends a line to a deployment log, wherever it lives. Never throws. */
const appendLogLine = async (
	logServerId: string | null,
	logPath: string,
	line: string,
) => {
	if (!logPath || logPath === ".") return;
	const text = `\n${line}\n`;
	try {
		if (logServerId) {
			const encoded = Buffer.from(text, "utf8").toString("base64");
			await withTimeout(
				execAsyncRemote(
					logServerId,
					`echo "${encoded}" | base64 -d >> '${logPath.replace(/'/g, `'\\''`)}'`,
				),
				KILL_TIMEOUT_MS,
				"The server holding the deployment log",
			);
		} else {
			await appendFile(logPath, text);
		}
	} catch (error) {
		console.error("Could not write the cancellation to the deployment log", error);
	}
};

export interface CancellableDeployment {
	deploymentId: string;
	logPath: string;
	/** Host the deployment log is on (null: this Dokploy host). */
	logServerId: string | null;
	buildServerId: string;
}

export type CancelOutcome =
	| { status: "not-running" }
	| {
			status: "cancelled";
			result: RemoteBuildKillResult | "UNREACHABLE";
			warning?: string;
	  };

/**
 * Stops one deployment's build on its build server and marks the deployment
 * cancelled. Best effort on the server side: when the build server cannot be
 * reached, the deployment is still cancelled locally (its job ends and frees
 * its queue slot and group lock) and the log says the build may still be
 * running there.
 */
export const cancelBuildServerDeployment = async (
	target: CancellableDeployment,
): Promise<CancelOutcome> => {
	const { deploymentId, logPath, logServerId, buildServerId } = target;

	// Claim it first and atomically: only a deployment that is still running
	// can be cancelled, and from here on every deploy step sees the flag.
	const [claimed] = await db
		.update(deployments)
		.set({ status: "cancelled", finishedAt: new Date().toISOString() })
		.where(
			and(
				eq(deployments.deploymentId, deploymentId),
				eq(deployments.status, "running"),
			),
		)
		.returning({ deploymentId: deployments.deploymentId });
	if (!claimed) return { status: "not-running" };

	await appendLogLine(
		logServerId,
		logPath,
		"⛔ Deployment cancelled by user. Stopping the build on the build server...",
	);

	let result: RemoteBuildKillResult | "UNREACHABLE" = "UNREACHABLE";
	let warning: string | undefined;
	try {
		const command = getKillRemoteBuildCommand(
			getRemoteBuildCancelTarget(deploymentId),
		);
		for (let attempt = 0; ; attempt++) {
			const { stdout } = await withTimeout(
				execAsyncRemote(buildServerId, command),
				KILL_TIMEOUT_MS,
				"The build server",
			);
			result = parseKillResult(stdout);
			// No pid file while a build step is starting in this process: it will
			// appear in a moment, so look again before giving up.
			if (
				result === "NONE" &&
				hasRunningRemoteBuild(deploymentId) &&
				attempt < PID_FILE_RETRIES
			) {
				await sleep(PID_FILE_RETRY_MS);
				continue;
			}
			break;
		}
		if (result === "FAILED") {
			warning =
				"The build process on the build server did not stop after SIGKILL; it may still be running.";
		} else if (result === "UNVERIFIED") {
			warning =
				"The build server has no /proc, so the build process could not be identified safely and was not signalled; it may still be running.";
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		warning = `Could not reach the build server to stop the build (${reason}). The deployment is cancelled here, but the build may keep running on the build server until it finishes.`;
	}

	// Release the job even if the build server never answers: drop the local
	// connection waiting on it. A no-op when the command already ended.
	abortRemoteBuild(deploymentId, "cancelled by user");

	if (warning) {
		console.warn(`Cancelling deployment ${deploymentId}: ${warning}`);
		await appendLogLine(logServerId, logPath, `⚠️ ${warning}`);
		await db
			.update(deployments)
			.set({ errorMessage: warning })
			.where(eq(deployments.deploymentId, deploymentId))
			.catch(() => {});
	} else {
		await appendLogLine(
			logServerId,
			logPath,
			result === "KILLED"
				? "✅ Build stopped on the build server."
				: "ℹ️ No build was running on the build server (it had not started, or had just finished). Nothing more will be built or deployed.",
		);
	}
	return { status: "cancelled", result, warning };
};

/**
 * What `application.killBuild` / `compose.killBuild` need: cancel every running
 * build-server deployment of the service. `usesBuildServer` is true when the
 * service builds on a build server, in which case the caller must not run the
 * generic `pkill` on the serving host (it would hit unrelated deployments).
 */
export const cancelBuildServerDeploymentsForService = async (
	service: { type: "application"; applicationId: string } | {
		type: "compose";
		composeId: string;
	},
): Promise<{ usesBuildServer: boolean; cancelled: number; warnings: string[] }> => {
	const warnings: string[] = [];
	let cancelled = 0;

	if (service.type === "application") {
		const running = await db.query.deployments.findMany({
			where: and(
				eq(deployments.applicationId, service.applicationId),
				eq(deployments.status, "running"),
			),
			columns: { deploymentId: true, logPath: true, buildServerId: true },
		});
		const onBuildServer = running.filter((row) => !!row.buildServerId);
		for (const row of onBuildServer) {
			const outcome = await cancelBuildServerDeployment({
				deploymentId: row.deploymentId,
				logPath: row.logPath,
				// The application's log is created on the host that builds.
				logServerId: row.buildServerId,
				buildServerId: row.buildServerId as string,
			});
			if (outcome.status === "cancelled") {
				cancelled++;
				if (outcome.warning) warnings.push(outcome.warning);
			}
		}
		return { usesBuildServer: onBuildServer.length > 0, cancelled, warnings };
	}

	const owner = await db.query.compose.findFirst({
		where: eq(compose.composeId, service.composeId),
		columns: { buildServerId: true, serverId: true },
	});
	if (!owner?.buildServerId) {
		return { usesBuildServer: false, cancelled, warnings };
	}
	const running = await db.query.deployments.findMany({
		where: and(
			eq(deployments.composeId, service.composeId),
			eq(deployments.status, "running"),
		),
		columns: { deploymentId: true, logPath: true },
	});
	for (const row of running) {
		const outcome = await cancelBuildServerDeployment({
			deploymentId: row.deploymentId,
			logPath: row.logPath,
			// A compose's log stays on its serving host.
			logServerId: owner.serverId,
			buildServerId: owner.buildServerId,
		});
		if (outcome.status === "cancelled") {
			cancelled++;
			if (outcome.warning) warnings.push(outcome.warning);
		}
	}
	return { usesBuildServer: true, cancelled, warnings };
};

/**
 * `deployment.killProcess` for a deployment that builds on a build server.
 * Returns `null` when the deployment does not (so the caller keeps its
 * existing behaviour), otherwise the outcome.
 */
export const cancelBuildServerDeploymentById = async (
	deploymentId: string,
): Promise<CancelOutcome | null> => {
	const row = await db.query.deployments.findFirst({
		where: eq(deployments.deploymentId, deploymentId),
		columns: {
			deploymentId: true,
			logPath: true,
			buildServerId: true,
			applicationId: true,
			composeId: true,
		},
	});
	if (!row) return null;

	if (row.applicationId && row.buildServerId) {
		return cancelBuildServerDeployment({
			deploymentId: row.deploymentId,
			logPath: row.logPath,
			logServerId: row.buildServerId,
			buildServerId: row.buildServerId,
		});
	}
	if (row.composeId) {
		const owner = await db.query.compose.findFirst({
			where: eq(compose.composeId, row.composeId),
			columns: { buildServerId: true, serverId: true },
		});
		if (owner?.buildServerId) {
			return cancelBuildServerDeployment({
				deploymentId: row.deploymentId,
				logPath: row.logPath,
				logServerId: owner.serverId,
				buildServerId: owner.buildServerId,
			});
		}
	}
	return null;
};
