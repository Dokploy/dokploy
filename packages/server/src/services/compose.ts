import { existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCompose,
	buildAppName,
	cleanAppName,
	compose,
} from "@dokploy/server/db/schema";
import { resyncBackupPoliciesForEnvironment } from "@dokploy/server/services/backup-policy";
import { prepareComposeBuildServerDeploy } from "@dokploy/server/services/compose-build-server";
import { pruneComposeBuildRegistry } from "@dokploy/server/services/compose-registry-retention";
import {
	type ComposePathLike,
	getBackupCurrentDeploymentCommand,
	getBuildComposeCommand,
	getComposeBuildOverridePath,
	getRollbackMarkerProbeCommand,
} from "@dokploy/server/utils/builders/compose";
import { randomizeSpecificationFile } from "@dokploy/server/utils/docker/compose";
import {
	cloneCompose,
	loadDockerCompose,
	loadDockerComposeRemote,
} from "@dokploy/server/utils/docker/domain";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import {
	cloneGitRepository,
	getGitCommitInfo,
} from "@dokploy/server/utils/providers/git";
import { cloneGiteaRepository } from "@dokploy/server/utils/providers/gitea";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";
import { cloneGitlabRepository } from "@dokploy/server/utils/providers/gitlab";
import { getCreateComposeFileCommand } from "@dokploy/server/utils/providers/raw";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { encodeBase64 } from "../utils/docker/utils";
import { getDokployUrl } from "./admin";
// Fork module: build-policy required checks for compose units.
// See services/build-policy/README.md.
import { waitForComposeRequiredChecks } from "./build-policy/compose-checks";
import {
	createDeploymentCompose,
	getDeploymentErrorMessage,
	updateDeployment,
	updateDeploymentStatus,
} from "./deployment";
import {
	appendLogLine,
	CANCELLED_THEN_FAILED_NOTE,
	CANCELLED_TOO_LATE_NOTE,
	DeploymentCancelledError,
	isDeploymentCancelled,
	isDeploymentCancelledError,
	markDeploymentDoneUnlessCancelled,
	statusAfterCancelledDeploy,
} from "./deployment-cancel";
import { generateApplyPatchesCommand } from "./patch";
import { validUniqueServerAppName } from "./project";

export type Compose = typeof compose.$inferSelect;

/** How long after a deploy returns its registry prune starts. */
export const REGISTRY_PRUNE_START_DELAY_MS = 3_000;

/**
 * Starts the build-registry cleanup of a build-server compose *after* the
 * deploy that triggered it has returned, never as part of it.
 *
 * The deployment queue holds a concurrency slot and the compose's group lock
 * until `deployCompose` / `rebuildCompose` resolve, so awaiting the prune there
 * would keep the next deploy of the same compose (and one of the LOCAL slots)
 * waiting on housekeeping. Here nothing is awaited: the prune is a timer, its
 * outcome is only ever logged, and it is not journaled (a prune lost to a
 * restart is simply retried by the next deploy). Whatever it does, including
 * throwing, cannot change the deployment's or the compose's status, because it
 * runs outside the deploy's try/catch and outside the queue job.
 *
 * A no-op (no timer at all) for a compose without a build server.
 */
export const scheduleComposeBuildRegistryPrune = (
	args: Parameters<typeof pruneComposeBuildRegistry>[0],
) => {
	if (!args.entity.buildServerId) return;
	try {
		const timer = setTimeout(() => {
			Promise.resolve()
				.then(() => pruneComposeBuildRegistry(args))
				.catch((error) => {
					console.error("Build registry cleanup failed", error);
				});
		}, REGISTRY_PRUNE_START_DELAY_MS);
		// Never keep the process alive (shutdown) for housekeeping.
		timer.unref?.();
	} catch (error) {
		console.error("Could not schedule the build registry cleanup", error);
	}
};

type ComposeBuildEntity = Awaited<ReturnType<typeof findComposeById>> & {
	type: "compose";
};

/**
 * Snapshots the compose file and `.env` that are on disk *before* the deploy
 * touches the code directory, so a failed deploy can restore exactly the
 * release that was serving traffic when it started.
 */
export const backupCurrentDeployment = async (
	compose: ComposePathLike,
	logPath: string,
) => {
	const command = `(${getBackupCurrentDeploymentCommand(compose)}) >> ${logPath} 2>&1`;
	if (compose.serverId) {
		await execAsyncRemote(compose.serverId, command);
	} else {
		await execAsync(command);
	}
};

/**
 * True when the deploy script reported that it restored the previous release
 * *and* brought it back up. The marker is bound to the deployment id, so a
 * marker written by an earlier deployment can never make this one look live.
 */
export const didRollbackSucceed = async (
	compose: ComposePathLike,
	logPath: string,
	deploymentId: string,
) => {
	const command = getRollbackMarkerProbeCommand(logPath, deploymentId);
	try {
		if (compose.serverId) {
			const { stdout } = await execAsyncRemote(compose.serverId, command);
			return stdout.trim() === "LIVE_OK";
		}
		const { stdout } = await execAsync(command);
		return stdout.trim() === "LIVE_OK";
	} catch {
		return false;
	}
};

/**
 * Shared clone → patches → (optional fresh-volumes down) → build pipeline used
 * by both `deployCompose` and the compose-preview deploy path. Extracting it
 * keeps `deployCompose` behavior identical while letting a preview run the same
 * steps against an in-memory entity whose `appName`, `branch`, `suffix`,
 * `domains` and `env` have been overridden for isolation.
 *
 * `applyPatches` is skipped for previews because `generateApplyPatchesCommand`
 * resolves the code directory from the base compose's appName, which does not
 * match the preview's isolated appName.
 *
 * The pipeline is transactional: the release currently on disk is snapshotted
 * before the clone, and `getBuildComposeCommand` restores it if the docker
 * command fails. Previews get the same treatment — their snapshots live under
 * their own isolated appName — so a broken PR push does not take the existing
 * preview URL down.
 */
export const runComposeBuild = async (
	entity: ComposeBuildEntity,
	deployment: { logPath: string; deploymentId?: string },
	options: {
		freshVolumes?: boolean;
		applyPatches?: boolean;
		/** False for compose previews, which cannot be cancelled (see prepare). */
		cancellable?: boolean;
	} = {},
) => {
	const { freshVolumes = false, applyPatches = true, cancellable } = options;
	const serverId = entity.serverId;

	const runStep = async (rawCommand: string) => {
		const commandWithLog = `(${rawCommand}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
	};

	// Must run before the clone / raw-file rewrite below overwrites the code
	// directory, otherwise there is nothing left to roll back to.
	await backupCurrentDeployment(entity, deployment.logPath);

	let command = "set -e;";
	if (entity.sourceType === "github") {
		command += await cloneGithubRepository(entity);
	} else if (entity.sourceType === "gitlab") {
		command += await cloneGitlabRepository(entity);
	} else if (entity.sourceType === "bitbucket") {
		command += await cloneBitbucketRepository(entity);
	} else if (entity.sourceType === "git") {
		command += await cloneGitRepository(entity);
	} else if (entity.sourceType === "gitea") {
		command += await cloneGiteaRepository(entity);
	} else if (entity.sourceType === "raw") {
		command += getCreateComposeFileCommand(entity);
	}
	await runStep(command);

	if (applyPatches && entity.sourceType !== "raw") {
		command = "set -e;";
		command += await generateApplyPatchesCommand({
			id: entity.composeId,
			type: "compose",
			serverId: entity.serverId,
		});
		await runStep(command);
	}

	// >>> build-policy hook (compose): required-checks gate, between the clone
	// and the build — the compose equivalent of the application path's hook
	// 2a/4. Deliberately ahead of the `down --volumes` step below, so a refused
	// check never leaves the stack torn down. Reads nothing at all when the
	// unit has no `requiredChecks`, which is every existing row.
	// See packages/server/src/services/build-policy/README.md
	await waitForComposeRequiredChecks({ compose: entity, serverId });
	// <<< build-policy hook (compose)

	// Build-server composes build and push their images before the running
	// release is touched, so a failed build never reaches `down --volumes`.
	// A no-op (undefined) for every compose without a `buildServerId`.
	const remoteBuild = await prepareComposeBuildServerDeploy({
		entity,
		deployment,
		runStep,
		applyPatches,
		freshVolumes,
		cancellable,
	});

	if (freshVolumes && entity.composeType === "docker-compose") {
		const downCommand = `set -e; env -i PATH="$PATH" docker compose -p ${entity.appName} down --volumes 2>&1 || true;`;
		await runStep(downCommand);
	}

	command = "set -e;";
	command += await getBuildComposeCommand(entity, {
		deploymentId: deployment.deploymentId,
		freshVolumes,
		remoteBuild,
	});
	await runStep(command);
};

export const createCompose = async (
	input: z.infer<typeof apiCreateCompose>,
) => {
	const appName = buildAppName("compose", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			composeFile: input.composeFile || "",
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	resyncBackupPoliciesForEnvironment(newDestination.environmentId);
	return newDestination;
};

export const createComposeByTemplate = async (
	input: typeof compose.$inferInsert,
) => {
	const appName = cleanAppName(input.appName);
	if (appName) {
		const valid = await validUniqueServerAppName(appName);

		if (!valid) {
			throw new TRPCError({
				code: "CONFLICT",
				message: "Service with this 'AppName' already exists",
			});
		}
	}
	const newDestination = await db
		.insert(compose)
		.values({
			...input,
			appName,
		})
		.returning()
		.then((value) => value[0]);

	if (!newDestination) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting compose",
		});
	}

	resyncBackupPoliciesForEnvironment(newDestination.environmentId);

	return newDestination;
};

export const findComposeById = async (composeId: string) => {
	const result = await db.query.compose.findFirst({
		where: eq(compose.composeId, composeId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			deployments: true,
			mounts: true,
			domains: true,
			github: {
				columns: {
					githubClientSecret: false,
					githubPrivateKey: false,
					githubWebhookSecret: false,
				},
			},
			gitlab: {
				columns: { secret: false, accessToken: false, refreshToken: false },
			},
			bitbucket: { columns: { appPassword: false, apiToken: false } },
			gitea: {
				columns: {
					clientSecret: false,
					accessToken: false,
					refreshToken: false,
				},
			},
			server: true,
			// Only its name: the restore step quotes it in "redeploy, which builds
			// on <name>" when it refuses to rebuild a pre-build-server release.
			buildServer: { columns: { serverId: true, name: true } },
			backups: {
				with: {
					destination: {
						columns: {
							accessKey: false,
							secretAccessKey: false,
						},
					},
					deployments: true,
				},
			},
		},
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Compose not found",
		});
	}
	return result;
};

export const loadServices = async (
	composeId: string,
	type: "fetch" | "cache" = "fetch",
) => {
	const compose = await findComposeById(composeId);

	if (type === "fetch") {
		const command = await cloneCompose(compose);
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, command);
		} else {
			await execAsync(command);
		}
	}

	let composeData: ComposeSpecification | null;

	if (compose.serverId) {
		composeData = await loadDockerComposeRemote(compose);
	} else {
		composeData = await loadDockerCompose(compose);
	}

	if (compose.randomize && composeData) {
		const randomizedCompose = randomizeSpecificationFile(
			composeData,
			compose.suffix,
		);
		composeData = randomizedCompose;
	}

	if (!composeData?.services) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Services not found",
		});
	}

	const services = Object.keys(composeData.services);

	return [...services];
};

export const updateCompose = async (
	composeId: string,
	composeData: Partial<Compose>,
) => {
	const { appName, ...rest } = composeData;
	const composeResult = await db
		.update(compose)
		.set({
			...rest,
		})
		.where(eq(compose.composeId, composeId))
		.returning();

	return composeResult[0];
};

/**
 * A build-server deploy that was cancelled (see `deployment-cancel.ts`) ends
 * here instead of in the generic failure path: the deployment already says
 * `cancelled` and must not become `error`, no build-error notification goes
 * out for something the user asked for, and the service returns to the state
 * of the release that is still serving.
 *
 * Returns the error to rethrow, or `null` when this was not a cancellation.
 *
 * Only a `DeploymentCancelledError` counts. A cancel that arrives too late
 * (the pull/up is already running) leaves the row `cancelled`, but if the
 * release then genuinely fails, that failure takes the normal failure path
 * (error status, rollback handling, notification) and the log notes the
 * earlier cancel request. The same goes for a cancel inside prepare whose
 * restore of the previous release failed: that is thrown as a plain error.
 */
const settleCancelledComposeDeploy = async (
	entity: Pick<Compose, "composeId" | "buildServerId" | "serverId">,
	deployment: { deploymentId: string; logPath: string },
	error: unknown,
) => {
	if (!entity.buildServerId) return null;
	if (!isDeploymentCancelledError(error)) return null;

	try {
		const command = `echo "\nDeployment cancelled ⛔ Nothing was pulled or started from this build; the previous release keeps serving." >> ${quote([deployment.logPath])};`;
		if (entity.serverId) {
			await execAsyncRemote(entity.serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (logError) {
		console.error("Could not log the cancelled deployment", logError);
	}
	const settledStatus = await statusAfterCancelledDeploy({
		composeId: entity.composeId,
	});
	await updateCompose(entity.composeId, { composeStatus: settledStatus });
	return new DeploymentCancelledError(undefined, { settledStatus });
};

export const deployCompose = async ({
	composeId,
	titleLog = "Manual deployment",
	descriptionLog = "",
	freshVolumes = false,
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
	freshVolumes?: boolean;
}) => {
	const compose = await findComposeById(composeId);

	const buildLink = `${await getDokployUrl()}/dashboard/project/${
		compose.environment.projectId
	}/environment/${compose.environmentId}/services/compose/${compose.composeId}?tab=deployments`;
	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		const entity = {
			...compose,
			type: "compose" as const,
		};

		await runComposeBuild(entity, deployment, { freshVolumes });

		// A cancel that landed during the pull/up cannot be honoured (the release
		// is already running); it stays recorded as cancelled, not "done".
		let finished = true;
		if (compose.buildServerId) {
			finished = await markDeploymentDoneUnlessCancelled(
				deployment.deploymentId,
			);
		} else {
			await updateDeploymentStatus(deployment.deploymentId, "done");
		}
		await updateCompose(composeId, {
			composeStatus: "done",
		});

		if (!finished) {
			await appendLogLine(
				compose.serverId,
				deployment.logPath,
				CANCELLED_TOO_LATE_NOTE,
			);
		} else {
			await sendBuildSuccessNotifications({
				projectName: compose.environment.project.name,
				applicationName: compose.name,
				applicationType: "compose",
				buildLink,
				organizationId: compose.environment.project.organizationId,
				domains: compose.domains,
				environmentName: compose.environment.name,
			});
		}

		// Build-server composes: drop old per-deployment registry tags, detached
		// (see scheduleComposeBuildRegistryPrune).
		scheduleComposeBuildRegistryPrune({ entity, deployment });
	} catch (error) {
		const cancelled = await settleCancelledComposeDeploy(
			compose,
			deployment,
			error,
		);
		if (cancelled) throw cancelled;

		let command = "";

		// Only log details for non-ExecError errors
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}

		// A cancel that came too late, followed by a real failure: say so, the
		// deployment ends as `error` (it did fail), not `cancelled`.
		if (
			compose.buildServerId &&
			(await isDeploymentCancelled(deployment.deploymentId))
		) {
			command += `echo "\n${CANCELLED_THEN_FAILED_NOTE}" >> ${deployment.logPath};`;
		}
		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");
		// The deployment itself always records the failure; the *service* is only
		// marked broken when the previous release could not be brought back.
		const rollbackSucceeded = await didRollbackSucceed(
			compose,
			deployment.logPath,
			deployment.deploymentId,
		);
		await updateCompose(composeId, {
			composeStatus: rollbackSucceeded ? "done" : "error",
		});
		const errorMessage = await getDeploymentErrorMessage({
			logPath: deployment.logPath,
			serverId: compose.serverId,
			fallback: "Error building, check the logs for details.",
		});

		await sendBuildErrorNotifications({
			projectName: compose.environment.project.name,
			applicationName: compose.name,
			applicationType: "compose",
			errorMessage,
			buildLink,
			organizationId: compose.environment.project.organizationId,
		});
		throw error;
	} finally {
		if (compose.sourceType !== "raw") {
			const commitInfo = await getGitCommitInfo({
				...compose,
				type: "compose",
			});
			if (commitInfo) {
				await updateDeployment(deployment.deploymentId, {
					title: commitInfo.message,
					description: `Commit: ${commitInfo.hash}`,
				});
			}
		}
	}
};

export const rebuildCompose = async ({
	composeId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
	freshVolumes = false,
}: {
	composeId: string;
	titleLog: string;
	descriptionLog: string;
	freshVolumes?: boolean;
}) => {
	const compose = await findComposeById(composeId);

	const deployment = await createDeploymentCompose({
		composeId: composeId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		// Snapshot before the raw-file rewrite / patch application below.
		await backupCurrentDeployment(compose, deployment.logPath);

		let command = "set -e;";
		if (compose.sourceType === "raw") {
			command += getCreateComposeFileCommand(compose);
		}

		let commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		if (compose.sourceType !== "raw") {
			command = "set -e;";
			command += await generateApplyPatchesCommand({
				id: compose.composeId,
				type: "compose",
				serverId: compose.serverId,
			});
			commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, commandWithLog);
			} else {
				await execAsync(commandWithLog);
			}
		}

		// >>> build-policy hook (compose rebuild): the same required-checks gate
		// `runComposeBuild` applies, in the same position — after the patches
		// step, ahead of the `down --volumes` step and the build.
		//
		// A redeploy re-uses whatever is already in the code directory, and
		// `runComposeBuild` clones *before* it gates, so a refused deploy leaves
		// the unchecked commit on disk. Without this call, Redeploy would build
		// exactly the commit the gate had just rejected. `rebuildApplication`
		// never had that hole; this is compose catching up. Round-3 review
		// finding H.
		await waitForComposeRequiredChecks({
			compose,
			serverId: compose.serverId,
		});
		// <<< build-policy hook (compose rebuild)

		// Build-server composes: build and push first (see runComposeBuild).
		const runRebuildStep = async (rawCommand: string) => {
			const stepWithLog = `(${rawCommand}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, stepWithLog);
			} else {
				await execAsync(stepWithLog);
			}
		};
		const remoteBuild = await prepareComposeBuildServerDeploy({
			entity: compose,
			deployment,
			runStep: runRebuildStep,
			freshVolumes,
			// A rebuild does not pull on the serving host, so it must not
			// build newer code on the build server either.
			reuseClone: true,
		});

		if (freshVolumes && compose.composeType === "docker-compose") {
			const downCommand = `set -e; env -i PATH="$PATH" docker compose -p ${compose.appName} down --volumes 2>&1 || true;`;
			const downWithLog = `(${downCommand}) >> ${deployment.logPath} 2>&1`;
			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, downWithLog);
			} else {
				await execAsync(downWithLog);
			}
		}

		command = "set -e;";
		command += await getBuildComposeCommand(compose, {
			deploymentId: deployment.deploymentId,
			freshVolumes,
			remoteBuild,
		});
		commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		// See deployCompose: a cancel during the pull/up stays cancelled.
		let finished = true;
		if (compose.buildServerId) {
			finished = await markDeploymentDoneUnlessCancelled(
				deployment.deploymentId,
			);
		} else {
			await updateDeploymentStatus(deployment.deploymentId, "done");
		}
		await updateCompose(composeId, {
			composeStatus: "done",
		});
		if (!finished) {
			await appendLogLine(
				compose.serverId,
				deployment.logPath,
				CANCELLED_TOO_LATE_NOTE,
			);
		}

		// Build-server composes: drop old per-deployment registry tags, detached
		// (see scheduleComposeBuildRegistryPrune).
		scheduleComposeBuildRegistryPrune({ entity: compose, deployment });
	} catch (error) {
		const cancelled = await settleCancelledComposeDeploy(
			compose,
			deployment,
			error,
		);
		if (cancelled) throw cancelled;

		let command = "";

		// Only log details for non-ExecError errors
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}

		// A cancel that came too late, followed by a real failure: say so, the
		// deployment ends as `error` (it did fail), not `cancelled`.
		if (
			compose.buildServerId &&
			(await isDeploymentCancelled(deployment.deploymentId))
		) {
			command += `echo "\n${CANCELLED_THEN_FAILED_NOTE}" >> ${deployment.logPath};`;
		}
		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		if (compose.serverId) {
			await execAsyncRemote(compose.serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");
		const rollbackSucceeded = await didRollbackSucceed(
			compose,
			deployment.logPath,
			deployment.deploymentId,
		);
		await updateCompose(composeId, {
			composeStatus: rollbackSucceeded ? "done" : "error",
		});
		throw error;
	}

	return true;
};

export const removeCompose = async (
	compose: Compose,
	deleteVolumes: boolean,
) => {
	try {
		const { COMPOSE_PATH } = paths(!!compose.serverId);
		const projectPath = join(COMPOSE_PATH, compose.appName);

		if (compose.composeType === "stack") {
			const command = `
			docker network disconnect ${compose.appName} dokploy-traefik;
			docker stack rm ${compose.appName};
			rm -rf ${projectPath}`;

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
		} else {
			const command = `
			docker network disconnect ${compose.appName} dokploy-traefik;
			env -i PATH="$PATH" docker compose -p ${compose.appName} down ${
				deleteVolumes ? "--volumes" : ""
			};
			rm -rf ${projectPath}`;

			if (compose.serverId) {
				await execAsyncRemote(compose.serverId, command);
			} else {
				await execAsync(command);
			}
		}
	} catch (error) {
		throw error;
	}

	return true;
};

// Starting or stopping a compose that was never deployed has no project
// directory to run in; without this check Node reports a misleading
// `spawn /bin/sh ENOENT`.
const assertComposeDirectoryExists = async (
	serverId: string | null,
	dir: string,
	action: "start" | "stop",
) => {
	let exists = true;
	if (serverId) {
		// Report through stdout so an SSH failure surfaces as itself instead of
		// being mistaken for a missing directory.
		const { stdout } = await execAsyncRemote(
			serverId,
			`if [ -d ${quote([dir])} ]; then echo present; else echo missing; fi`,
		);
		exists = stdout.trim() !== "missing";
	} else {
		exists = existsSync(dir);
	}
	if (!exists) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `This compose hasn't been deployed yet, so there is nothing to ${action}. Deploy it first.`,
		});
	}
};

export const startCompose = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	const projectPath = join(COMPOSE_PATH, compose.appName, "code");
	if (compose.composeType === "docker-compose") {
		await assertComposeDirectoryExists(compose.serverId, projectPath, "start");
	}
	try {
		const path =
			compose.sourceType === "raw" ? "docker-compose.yml" : compose.composePath;
		// A compose built on a build server starts from the pushed images: merge
		// the override (when the last deploy wrote one) and never build here.
		let baseCommand = `env -i PATH="$PATH" docker compose -p ${quote([compose.appName])} -f ${quote([path])} up -d`;
		if (compose.buildServerId) {
			const overridePath = quote([getComposeBuildOverridePath(compose)]);
			const upBase = `env -i PATH="$PATH" docker compose -p ${quote([compose.appName])} -f ${quote([path])}`;
			baseCommand = `if [ -f ${overridePath} ]; then ${upBase} -f ${overridePath} up -d --no-build; else ${upBase} up -d --no-build; fi`;
		}
		if (compose.composeType === "docker-compose") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`cd ${projectPath} && ${baseCommand}`,
				);
			} else {
				await execAsync(baseCommand, {
					cwd: projectPath,
				});
			}
		}

		await updateCompose(composeId, {
			composeStatus: "done",
		});
	} catch (error) {
		await updateCompose(composeId, {
			composeStatus: "idle",
		});
		throw error;
	}

	return true;
};

export const stopCompose = async (composeId: string) => {
	const compose = await findComposeById(composeId);
	const { COMPOSE_PATH } = paths(!!compose.serverId);
	if (compose.composeType === "docker-compose") {
		await assertComposeDirectoryExists(
			compose.serverId,
			join(COMPOSE_PATH, compose.appName),
			"stop",
		);
	}
	try {
		if (compose.composeType === "docker-compose") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`cd ${join(COMPOSE_PATH, compose.appName)} && env -i PATH="$PATH" docker compose -p ${
						compose.appName
					} stop`,
				);
			} else {
				await execAsync(
					`env -i PATH="$PATH" docker compose -p ${compose.appName} stop`,
					{
						cwd: join(COMPOSE_PATH, compose.appName),
					},
				);
			}
		}

		if (compose.composeType === "stack") {
			if (compose.serverId) {
				await execAsyncRemote(
					compose.serverId,
					`docker stack rm ${compose.appName}`,
				);
			} else {
				await execAsync(`docker stack rm ${compose.appName}`);
			}
		}

		await updateCompose(composeId, {
			composeStatus: "idle",
		});
	} catch (error) {
		await updateCompose(composeId, {
			composeStatus: "error",
		});
		throw error;
	}

	return true;
};
