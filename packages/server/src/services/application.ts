import { docker } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateApplication,
	applications,
	buildAppName,
} from "@dokploy/server/db/schema";
import { getAdvancedStats } from "@dokploy/server/monitoring/utils";
import { resyncBackupPoliciesForEnvironment } from "@dokploy/server/services/backup-policy";
import {
	getBuildCommand,
	mechanizeDockerContainer,
} from "@dokploy/server/utils/builders";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
	ExecError,
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { cloneBitbucketRepository } from "@dokploy/server/utils/providers/bitbucket";
import { buildRemoteDocker } from "@dokploy/server/utils/providers/docker";
import {
	cloneGitRepository,
	getGitCommitInfo,
} from "@dokploy/server/utils/providers/git";
import { cloneGiteaRepository } from "@dokploy/server/utils/providers/gitea";
import { cloneGithubRepository } from "@dokploy/server/utils/providers/github";
import { cloneGitlabRepository } from "@dokploy/server/utils/providers/gitlab";
import { createTraefikConfig } from "@dokploy/server/utils/traefik/application";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { deployHook } from "../db/schema";
import { parseDeployHooks, runDeployHook } from "../utils/docker/hooks";
import { encodeBase64, waitForSwarmServiceStable } from "../utils/docker/utils";
import { getDokployUrl } from "./admin";
// Fork module: enforced remote builds. See services/build-policy/README.md.
import {
	type BuildPolicyPlan,
	getBuildPolicyPushCommand,
	planApplicationBuild,
	prepareBuildPolicyDeploy,
	reportBuildPolicyPlanFailure,
	runBuildPolicyPreBuildGate,
	toBuildPolicyUnit,
} from "./build-policy/apply";
import {
	createDeployment,
	createDeploymentPreview,
	getDeploymentErrorMessage,
	updateDeployment,
	updateDeploymentStatus,
} from "./deployment";
import {
	appendLogLine,
	assertBuildNotCancelled,
	CANCELLED_TOO_LATE_NOTE,
	DeploymentCancelledError,
	isDeploymentCancelled,
	markDeploymentDoneUnlessCancelled,
	runRemoteBuildScript,
	statusAfterCancelledDeploy,
} from "./deployment-cancel";
import { type Domain, getDomainHost } from "./domain";
import { getIssueComment } from "./github";
import { generateApplyPatchesCommand } from "./patch";
import {
	ensurePreviewComment,
	getPreviewCommentContext,
	updatePreviewComment,
} from "./preview-comment";
import {
	findPreviewDeploymentById,
	updatePreviewDeployment,
} from "./preview-deployment";
import { validUniqueServerAppName } from "./project";
import { registerPreviewDeployment } from "./snapvisor";
export type Application = typeof applications.$inferSelect;

export const createApplication = async (
	input: z.infer<typeof apiCreateApplication>,
) => {
	const appName = buildAppName("app", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Application with this 'AppName' already exists",
		});
	}

	const createdApplication = await db.transaction(async (tx) => {
		const newApplication = await tx
			.insert(applications)
			.values({
				...input,
				appName,
			})
			.returning()
			.then((value) => value[0]);

		if (!newApplication) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the application",
			});
		}

		if (process.env.NODE_ENV === "development") {
			createTraefikConfig(newApplication.appName);
		}

		return newApplication;
	});
	resyncBackupPoliciesForEnvironment(createdApplication.environmentId);
	return createdApplication;
};

export const findApplicationById = async (applicationId: string) => {
	const application = await db.query.applications.findFirst({
		where: eq(applications.applicationId, applicationId),
		with: {
			environment: { with: { project: true } },
			domains: true,
			deployments: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
			gitlab: {
				columns: { secret: false, accessToken: false, refreshToken: false },
			},
			github: {
				columns: {
					githubClientSecret: false,
					githubPrivateKey: false,
					githubWebhookSecret: false,
				},
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
			previewDeployments: true,
			registry: { columns: { password: false } },
			buildRegistry: { columns: { password: false } },
			rollbackRegistry: { columns: { password: false } },
		},
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Application not found",
		});
	}
	return application;
};

export const findApplicationByName = async (appName: string) => {
	const application = await db.query.applications.findFirst({
		where: eq(applications.appName, appName),
	});

	return application;
};

export const updateApplication = async (
	applicationId: string,
	applicationData: Partial<Application>,
) => {
	const { appName, ...rest } = applicationData;
	const application = await db
		.update(applications)
		.set({
			...rest,
		})
		.where(eq(applications.applicationId, applicationId))
		.returning();

	return application[0];
};

export const updateApplicationStatus = async (
	applicationId: string,
	applicationStatus: Application["applicationStatus"],
) => {
	const application = await db
		.update(applications)
		.set({
			applicationStatus: applicationStatus,
		})
		.where(eq(applications.applicationId, applicationId))
		.returning();

	return application;
};

/**
 * A cancelled build-server deployment ends here instead of in the generic
 * failure path: it stays `cancelled` (not `error`), sends no build-error
 * notification, and the application goes back to idle. Returns the error to
 * rethrow, or `null` when this deployment was not cancelled (every deployment
 * without a build server).
 */
const settleCancelledApplicationDeploy = async (
	applicationId: string,
	deployment: { deploymentId: string; buildServerId?: string | null },
) => {
	if (!deployment.buildServerId) return null;
	if (!(await isDeploymentCancelled(deployment.deploymentId))) return null;
	await updateApplicationStatus(
		applicationId,
		await statusAfterCancelledDeploy({ applicationId }),
	);
	return new DeploymentCancelledError();
};

export const deployApplication = async ({
	applicationId,
	titleLog = "Manual deployment",
	descriptionLog = "",
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const application = await findApplicationById(applicationId);
	// >>> build-policy hook 1/4: enforced remote builds. Runs before
	// `createDeployment` because the deployment log has to be created on the
	// host that will build. A refusal still produces a deployment row, an error
	// status and a build-failure notification before it is rethrown.
	// See packages/server/src/services/build-policy/README.md
	let buildPolicy: BuildPolicyPlan;
	try {
		buildPolicy = await planApplicationBuild(toBuildPolicyUnit(application));
	} catch (error) {
		await reportBuildPolicyPlanFailure({
			application,
			titleLog,
			descriptionLog,
			error,
		});
		throw error;
	}
	const serverId =
		buildPolicy.buildServerId ||
		application.buildServerId ||
		application.serverId;
	// <<< build-policy hook 1/4
	const applicationEntity = {
		...application,
		serverId: serverId,
	};

	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;
	const deployment = await createDeployment(
		{
			applicationId: applicationId,
			title: titleLog,
			description: descriptionLog,
		},
		// build-policy hook: create the log on the host that will build.
		{ buildServerId: buildPolicy.buildServerId },
	);

	try {
		let command = "set -e;";
		if (application.sourceType === "github") {
			command += await cloneGithubRepository(applicationEntity);
		} else if (application.sourceType === "gitlab") {
			command += await cloneGitlabRepository(applicationEntity);
		} else if (application.sourceType === "gitea") {
			command += await cloneGiteaRepository(applicationEntity);
		} else if (application.sourceType === "bitbucket") {
			command += await cloneBitbucketRepository(applicationEntity);
		} else if (application.sourceType === "git") {
			command += await cloneGitRepository(applicationEntity);
		} else if (application.sourceType === "docker") {
			command += await buildRemoteDocker(application);
		}

		if (application.sourceType !== "docker") {
			command += await generateApplyPatchesCommand({
				id: application.applicationId,
				type: "application",
				serverId,
			});
		}

		// >>> build-policy hook 2a/4: the required-checks gate, between the clone
		// and the build. Runs the clone half itself and returns a fresh prefix
		// when it is active; returns `command` unchanged and executes nothing
		// when it is not, which is every deploy while the policy is off.
		command = await runBuildPolicyPreBuildGate({
			application,
			plan: buildPolicy,
			deployment,
			serverId,
			command,
		});
		// <<< build-policy hook 2a/4

		command += await getBuildCommand(application);

		// >>> build-policy hook 2/4: tag `<repository>:<sha>`, push to the
		// organization registry and echo the digest. Empty when not enforcing.
		command += await getBuildPolicyPushCommand(buildPolicy, {
			appName: application.appName,
			serverId,
		});
		// <<< build-policy hook 2/4

		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await runRemoteBuildScript(serverId, commandWithLog, deployment);
		} else {
			await execAsync(commandWithLog);
		}
		await assertBuildNotCancelled(deployment);

		// >>> build-policy hook 3/4: gate on required checks, then pin the deploy
		// to the digest that was just published. Identity when not enforcing.
		const deployTarget = await prepareBuildPolicyDeploy({
			application,
			plan: buildPolicy,
			deployment,
			serverId,
		});
		// <<< build-policy hook 3/4

		const hookRow = await db.query.deployHook.findFirst({
			where: eq(deployHook.applicationId, application.applicationId),
		});
		const deployHooks = parseDeployHooks(hookRow?.hooks);

		// Hooks exec inside the application's own container, which only exists
		// on the deploy host. `serverId` above is `buildServerId || serverId` —
		// using it here would target the build server, where the container is
		// absent (pre would silently no-op, post would throw).
		await assertBuildNotCancelled(deployment);
		await runDeployHook({
			kind: "pre",
			appName: application.appName,
			serverId: application.serverId,
			command: deployHooks.pre,
			logPath: deployment.logPath,
			logServerId: deployment.buildServerId || deployment.serverId,
		});

		// build-policy hook 4/4: `deployTarget` is `application` plus the pinned
		// digest when a remote build was enforced. See hook 3/4 above.
		// The pre-deploy hook can take a while: a cancel meanwhile must stop the
		// container from being replaced.
		await assertBuildNotCancelled(deployment);
		await mechanizeDockerContainer(deployTarget);

		const stability = await waitForSwarmServiceStable(application.appName, {
			serverId: application.serverId,
		});
		if (!stability.stable) {
			throw new Error(
				`Container did not stay running after deployment: ${stability.reason}`,
			);
		}

		if (deployHooks.post?.trim()) {
			await runDeployHook({
				kind: "post",
				appName: application.appName,
				serverId: application.serverId,
				command: deployHooks.post,
				logPath: deployment.logPath,
				logServerId: deployment.buildServerId || deployment.serverId,
				containerId: stability.containerId,
			});
		}

		// A cancel that landed while the container was being replaced cannot be
		// honoured (the release is already running); it stays recorded as
		// cancelled instead of being overwritten by "done".
		let finished = true;
		if (deployment.buildServerId) {
			finished = await markDeploymentDoneUnlessCancelled(
				deployment.deploymentId,
			);
		} else {
			await updateDeploymentStatus(deployment.deploymentId, "done");
		}
		await updateApplicationStatus(applicationId, "done");

		if (!finished) {
			await appendLogLine(
				deployment.buildServerId,
				deployment.logPath,
				CANCELLED_TOO_LATE_NOTE,
			);
		} else {
			await sendBuildSuccessNotifications({
				projectName: application.environment.project.name,
				applicationName: application.name,
				applicationType: "application",
				buildLink,
				organizationId: application.environment.project.organizationId,
				domains: application.domains,
				environmentName: application.environment.name,
			});
		}
	} catch (error) {
		const cancelled = await settleCancelledApplicationDeploy(
			applicationId,
			deployment,
		);
		if (cancelled) throw cancelled;

		let command = "";

		// Only log details for non-ExecError errors
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}

		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");

		const errorMessage = await getDeploymentErrorMessage({
			logPath: deployment.logPath,
			serverId,
			fallback: "Error building, check the logs for details.",
		});

		await sendBuildErrorNotifications({
			projectName: application.environment.project.name,
			applicationName: application.name,
			applicationType: "application",
			errorMessage,
			buildLink,
			organizationId: application.environment.project.organizationId,
		});

		throw error;
	} finally {
		// Only extract commit info for non-docker sources
		if (application.sourceType !== "docker") {
			const commitInfo = await getGitCommitInfo({
				appName: application.appName,
				type: "application",
				serverId: serverId,
			});
			if (commitInfo) {
				await updateDeployment(deployment.deploymentId, {
					title: commitInfo.message,
					description: `Commit: ${commitInfo.hash}`,
				});
			}
		}
	}
	return true;
};

export const rebuildApplication = async ({
	applicationId,
	titleLog = "Rebuild deployment",
	descriptionLog = "",
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
}) => {
	const application = await findApplicationById(applicationId);
	// >>> build-policy hook 1/4 (rebuild). See services/build-policy/README.md
	let buildPolicy: BuildPolicyPlan;
	try {
		buildPolicy = await planApplicationBuild(toBuildPolicyUnit(application));
	} catch (error) {
		await reportBuildPolicyPlanFailure({
			application,
			titleLog,
			descriptionLog,
			error,
		});
		throw error;
	}
	const serverId =
		buildPolicy.buildServerId ||
		application.buildServerId ||
		application.serverId;
	// <<< build-policy hook 1/4
	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;

	const deployment = await createDeployment(
		{
			applicationId: applicationId,
			title: titleLog,
			description: descriptionLog,
		},
		// build-policy hook: create the log on the host that will build.
		{ buildServerId: buildPolicy.buildServerId },
	);

	try {
		let command = "set -e;";
		// >>> build-policy hook 2a/4 (rebuild): the required-checks gate. A
		// rebuild has no clone, so this only waits; the existing checkout is
		// already the commit being rebuilt.
		command = await runBuildPolicyPreBuildGate({
			application,
			plan: buildPolicy,
			deployment,
			serverId,
			command,
		});
		// <<< build-policy hook 2a/4 (rebuild)
		// Check case for docker only
		command += await getBuildCommand(application);
		// >>> build-policy hook 2/4 (rebuild)
		command += await getBuildPolicyPushCommand(buildPolicy, {
			appName: application.appName,
			serverId,
		});
		// <<< build-policy hook 2/4
		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await runRemoteBuildScript(serverId, commandWithLog, deployment);
		} else {
			await execAsync(commandWithLog);
		}
		await assertBuildNotCancelled(deployment);

		// >>> build-policy hook 3/4 (rebuild)
		const deployTarget = await prepareBuildPolicyDeploy({
			application,
			plan: buildPolicy,
			deployment,
			serverId,
		});
		// <<< build-policy hook 3/4

		const hookRow = await db.query.deployHook.findFirst({
			where: eq(deployHook.applicationId, application.applicationId),
		});
		const deployHooks = parseDeployHooks(hookRow?.hooks);

		// See deployApplication: hooks must target the deploy host
		// (`application.serverId`), never the build server.
		await assertBuildNotCancelled(deployment);
		await runDeployHook({
			kind: "pre",
			appName: application.appName,
			serverId: application.serverId,
			command: deployHooks.pre,
			logPath: deployment.logPath,
			logServerId: deployment.buildServerId || deployment.serverId,
		});

		// build-policy hook 4/4 (rebuild): see hook 3/4 above.
		// The pre-deploy hook can take a while: a cancel meanwhile must stop the
		// container from being replaced.
		await assertBuildNotCancelled(deployment);
		await mechanizeDockerContainer(deployTarget);

		const stability = await waitForSwarmServiceStable(application.appName, {
			serverId: application.serverId,
		});
		if (!stability.stable) {
			throw new Error(
				`Container did not stay running after rebuild: ${stability.reason}`,
			);
		}

		if (deployHooks.post?.trim()) {
			await runDeployHook({
				kind: "post",
				appName: application.appName,
				serverId: application.serverId,
				command: deployHooks.post,
				logPath: deployment.logPath,
				logServerId: deployment.buildServerId || deployment.serverId,
				containerId: stability.containerId,
			});
		}

		// A cancel that landed while the container was being replaced cannot be
		// honoured (the release is already running); it stays recorded as
		// cancelled instead of being overwritten by "done".
		let finished = true;
		if (deployment.buildServerId) {
			finished = await markDeploymentDoneUnlessCancelled(
				deployment.deploymentId,
			);
		} else {
			await updateDeploymentStatus(deployment.deploymentId, "done");
		}
		await updateApplicationStatus(applicationId, "done");

		if (!finished) {
			await appendLogLine(
				deployment.buildServerId,
				deployment.logPath,
				CANCELLED_TOO_LATE_NOTE,
			);
		} else {
			await sendBuildSuccessNotifications({
				projectName: application.environment.project.name,
				applicationName: application.name,
				applicationType: "application",
				buildLink,
				organizationId: application.environment.project.organizationId,
				domains: application.domains,
				environmentName: application.environment.name,
			});
		}
	} catch (error) {
		const cancelled = await settleCancelledApplicationDeploy(
			applicationId,
			deployment,
		);
		if (cancelled) throw cancelled;

		let command = "";

		// Only log details for non-ExecError errors
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}

		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");
		throw error;
	}

	return true;
};

const resolvePreviewTemplateVariables = (
	value: string,
	pullRequestNumber: string,
) => value.replaceAll("${{preview.prNumber}}", pullRequestNumber);

/**
 * Build a writer that keeps the pull request comment of a preview deployment up
 * to date, no matter which git provider hosts the pull request. The comment can
 * be deleted by users, so it is recreated (and the new id persisted) on demand.
 *
 * Source types that do not write preview comments through this layer (GitLab
 * previews report status as merge request notes from the webhook handler, and a
 * half-configured provider has no coordinates to post with) resolve to no
 * comment context, in which case the writer is a no-op instead of failing the
 * deployment.
 */
const buildPreviewCommentWriter = ({
	application,
	previewDeployment,
	previewDeploymentId,
	previewDomain,
}: {
	application: { name: string } & Parameters<
		typeof getPreviewCommentContext
	>[0];
	previewDeployment: {
		pullRequestNumber: string;
		pullRequestCommentId: string;
	};
	previewDeploymentId: string;
	previewDomain: string;
}) => {
	let commentId = previewDeployment.pullRequestCommentId;
	const issueNumber = previewDeployment.pullRequestNumber;

	return async (status: "running" | "success" | "error") => {
		const commentContext = getPreviewCommentContext(application);

		if (!commentContext) {
			return;
		}

		const comment = getIssueComment(application.name, status, previewDomain);
		const body = `### Dokploy Preview Deployment\n\n${comment}`;

		const ensured = await ensurePreviewComment(commentContext, {
			issueNumber,
			commentId,
			body,
		});

		if (ensured.created) {
			// The freshly created comment already carries `body`, only the new id
			// has to be remembered for the next status update.
			commentId = ensured.commentId;
			await updatePreviewDeployment(previewDeploymentId, {
				pullRequestCommentId: commentId,
			});
			return;
		}

		await updatePreviewComment(commentContext, {
			issueNumber,
			commentId,
			body,
		});
	};
};

/**
 * After a preview build succeeds: records the commit it built using the same
 * `Commit: <sha>` marker `deployApplication`'s `finally` block writes for
 * regular deploys (read back by `findLatestPreviewCommitSha` in
 * `services/snapvisor.ts`), then best-effort links the Snapvisor build for
 * that commit. Neither step may fail the deploy: commit extraction mirrors
 * the existing non-preview convention exactly, and the Snapvisor call is
 * fire-and-forget with its own `.catch`.
 */
const finalizePreviewBuildMetadata = async ({
	application,
	previewDeploymentId,
	appName,
	deploymentId,
	serverId,
}: {
	application: Pick<Application, "sourceType">;
	previewDeploymentId: string;
	appName: string;
	deploymentId: string;
	serverId: string | null;
}) => {
	if (application.sourceType !== "docker") {
		const commitInfo = await getGitCommitInfo({
			appName,
			type: "application",
			serverId,
		});
		if (commitInfo) {
			await updateDeployment(deploymentId, {
				title: commitInfo.message,
				description: `Commit: ${commitInfo.hash}`,
			});
		}
	}

	registerPreviewDeployment({ previewDeploymentId }).catch((error) => {
		console.error(
			"Error registering the Snapvisor preview deployment:",
			error,
		);
	});
};

export const deployPreviewApplication = async ({
	applicationId,
	titleLog = "Preview Deployment",
	descriptionLog = "",
	previewDeploymentId,
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
	previewDeploymentId: string;
}) => {
	const application = await findApplicationById(applicationId);
	// >>> build-policy hook 1/4 (preview): a PR preview is GitHub App sourced
	// like any other deploy, so spec 5.2.1 forces it onto the build server too.
	// The plan needs the preview's own appName, so the preview row is read
	// before the deployment record is created rather than after; the read is
	// idempotent and `createDeploymentPreview` reads it again itself.
	// A refused plan is rethrown inside the try below, so the preview status,
	// the log and the PR comment all report it. See build-policy/README.md
	const previewDeployment =
		await findPreviewDeploymentById(previewDeploymentId);
	let buildPolicy: BuildPolicyPlan | null = null;
	let buildPolicyError: unknown = null;
	try {
		buildPolicy = await planApplicationBuild({
			...toBuildPolicyUnit(application),
			appName: previewDeployment.appName,
		});
	} catch (error) {
		buildPolicyError = error;
	}

	const deployment = await createDeploymentPreview(
		{
			title: titleLog,
			description: descriptionLog,
			previewDeploymentId: previewDeploymentId,
		},
		{ buildServerId: buildPolicy?.buildServerId },
	);
	// <<< build-policy hook 1/4 (preview)

	await updatePreviewDeployment(previewDeploymentId, {
		createdAt: new Date().toISOString(),
	});

	const previewDomain = getDomainHost(previewDeployment?.domain as Domain);
	const writePreviewComment = buildPreviewCommentWriter({
		application,
		previewDeployment,
		previewDeploymentId,
		previewDomain,
	});
	try {
		await writePreviewComment("running");

		// build-policy hook 1/4 (preview), continued: refusing here rather than
		// above means the preview status, the log and the PR comment all say why.
		if (!buildPolicy) throw buildPolicyError;

		application.appName = previewDeployment.appName;
		application.env = resolvePreviewTemplateVariables(
			`${application.previewEnv}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.buildArgs = resolvePreviewTemplateVariables(
			`${application.previewBuildArgs}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.buildSecrets = resolvePreviewTemplateVariables(
			`${application.previewBuildSecrets}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.rollbackActive = false;
		if (
			!application.buildServerId ||
			application.buildServerId === application.serverId
		) {
			application.buildRegistry = null;
		}
		application.rollbackRegistry = null;
		application.registry = null;

		const buildServerId =
			buildPolicy.buildServerId ||
			application.buildServerId ||
			application.serverId;
		const applicationEntity = {
			...application,
			serverId: buildServerId,
		};
		let command = "set -e;";
		if (application.sourceType === "github") {
			command += await cloneGithubRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				branch: previewDeployment.branch,
			});
		} else if (application.sourceType === "gitlab") {
			command += await cloneGitlabRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				gitlabBranch: previewDeployment.branch,
			});
		} else if (application.sourceType === "gitea") {
			command += await cloneGiteaRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				giteaBranch: previewDeployment.branch,
			});
		} else {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Preview deployments are not supported for the '${application.sourceType}' source type`,
			});
		}
		// >>> build-policy hook 2a/4 (preview): the required-checks gate, on the
		// preview's own checkout, between the clone and the build.
		command = await runBuildPolicyPreBuildGate({
			application,
			plan: buildPolicy,
			deployment,
			serverId: buildServerId,
			command,
			appName: previewDeployment.appName,
		});
		// <<< build-policy hook 2a/4 (preview)

		command += await getBuildCommand(application);

		// >>> build-policy hook 2/4 (preview): tag and push the preview image by
		// sha. Empty when not enforcing.
		command += await getBuildPolicyPushCommand(buildPolicy, {
			appName: previewDeployment.appName,
			serverId: buildServerId,
		});
		// <<< build-policy hook 2/4 (preview)

		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (buildServerId) {
			await execAsyncRemote(buildServerId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
		// >>> build-policy hook 3/4 (preview): pin to the digest just published.
		// Identity when not enforcing.
		const deployTarget = await prepareBuildPolicyDeploy({
			application,
			plan: buildPolicy,
			deployment,
			serverId: buildServerId,
		});
		// <<< build-policy hook 3/4 (preview)
		// build-policy hook 4/4 (preview): `deployTarget` is `application` plus
		// the pinned digest when a remote build was enforced.
		await mechanizeDockerContainer(deployTarget);

		await finalizePreviewBuildMetadata({
			application,
			previewDeploymentId,
			appName: previewDeployment.appName,
			deploymentId: deployment.deploymentId,
			serverId: buildServerId,
		});

		await writePreviewComment("success");
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "done",
		});
	} catch (error) {
		let command = "";
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}
		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		const buildServerId = application.buildServerId || application.serverId;
		try {
			if (buildServerId) {
				await execAsyncRemote(buildServerId, command);
			} else {
				await execAsync(command);
			}
		} catch (logError) {
			console.error(logError);
		}

		// Never let a failing status comment hide the actual build error.
		await writePreviewComment("error").catch((commentError) => {
			console.error(
				"Error reporting the preview deployment failure:",
				commentError,
			);
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "error",
		});
		throw error;
	}

	return true;
};

export const rebuildPreviewApplication = async ({
	applicationId,
	titleLog = "Rebuild Preview Deployment",
	descriptionLog = "",
	previewDeploymentId,
}: {
	applicationId: string;
	titleLog: string;
	descriptionLog: string;
	previewDeploymentId: string;
}) => {
	const application = await findApplicationById(applicationId);
	const previewDeployment =
		await findPreviewDeploymentById(previewDeploymentId);

	// >>> build-policy hook 1/4 (preview rebuild). See build-policy/README.md
	let buildPolicy: BuildPolicyPlan | null = null;
	let buildPolicyError: unknown = null;
	try {
		buildPolicy = await planApplicationBuild({
			...toBuildPolicyUnit(application),
			appName: previewDeployment.appName,
		});
	} catch (error) {
		buildPolicyError = error;
	}

	const deployment = await createDeploymentPreview(
		{
			title: titleLog,
			description: descriptionLog,
			previewDeploymentId: previewDeploymentId,
		},
		{ buildServerId: buildPolicy?.buildServerId },
	);
	// <<< build-policy hook 1/4 (preview rebuild)

	const previewDomain = getDomainHost(previewDeployment?.domain as Domain);
	const writePreviewComment = buildPreviewCommentWriter({
		application,
		previewDeployment,
		previewDeploymentId,
		previewDomain,
	});

	try {
		await writePreviewComment("running");

		// build-policy hook 1/4 (preview rebuild), continued.
		if (!buildPolicy) throw buildPolicyError;

		// Set application properties for preview deployment
		application.appName = previewDeployment.appName;
		application.env = resolvePreviewTemplateVariables(
			`${application.previewEnv}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.buildArgs = resolvePreviewTemplateVariables(
			`${application.previewBuildArgs}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.buildSecrets = resolvePreviewTemplateVariables(
			`${application.previewBuildSecrets}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`,
			previewDeployment.pullRequestNumber,
		);
		application.rollbackActive = false;
		if (
			!application.buildServerId ||
			application.buildServerId === application.serverId
		) {
			application.buildRegistry = null;
		}
		application.rollbackRegistry = null;
		application.registry = null;

		const buildServerId =
			buildPolicy.buildServerId ||
			application.buildServerId ||
			application.serverId;
		const applicationEntity = {
			...application,
			serverId: buildServerId,
		};
		let command = "set -e;";
		// Re-clone the repository at the latest tip of the preview branch
		// before rebuilding. Without this, every PR `synchronize` event
		// (i.e., every push to an existing PR) only re-runs `docker build`
		// against the original snapshot taken at PR open. BuildKit then
		// cache-hits every layer including `COPY . .` and the deploy
		// finishes in seconds while still serving the original commit.
		// Symmetric with `deployPreviewApplication` above.
		if (application.sourceType === "github") {
			command += await cloneGithubRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				branch: previewDeployment.branch,
			});
		} else if (application.sourceType === "gitlab") {
			command += await cloneGitlabRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				gitlabBranch: previewDeployment.branch,
			});
		} else if (application.sourceType === "gitea") {
			command += await cloneGiteaRepository({
				...applicationEntity,
				appName: previewDeployment.appName,
				giteaBranch: previewDeployment.branch,
			});
		} else {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Preview deployments are not supported for the '${application.sourceType}' source type`,
			});
		}
		// >>> build-policy hook 2a/4 (preview rebuild): the required-checks gate.
		command = await runBuildPolicyPreBuildGate({
			application,
			plan: buildPolicy,
			deployment,
			serverId: buildServerId,
			command,
			appName: previewDeployment.appName,
		});
		// <<< build-policy hook 2a/4 (preview rebuild)
		command += await getBuildCommand(application);
		// >>> build-policy hook 2/4 (preview rebuild)
		command += await getBuildPolicyPushCommand(buildPolicy, {
			appName: previewDeployment.appName,
			serverId: buildServerId,
		});
		// <<< build-policy hook 2/4 (preview rebuild)
		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (buildServerId) {
			await execAsyncRemote(buildServerId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
		// >>> build-policy hook 3/4 (preview rebuild)
		const deployTarget = await prepareBuildPolicyDeploy({
			application,
			plan: buildPolicy,
			deployment,
			serverId: buildServerId,
		});
		// <<< build-policy hook 3/4 (preview rebuild)
		// build-policy hook 4/4 (preview rebuild)
		await mechanizeDockerContainer(deployTarget);

		await finalizePreviewBuildMetadata({
			application,
			previewDeploymentId,
			appName: previewDeployment.appName,
			deploymentId: deployment.deploymentId,
			serverId: buildServerId,
		});

		await writePreviewComment("success");
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "done",
		});
	} catch (error) {
		let command = "";

		// Only log details for non-ExecError errors
		if (!(error instanceof ExecError)) {
			const message = error instanceof Error ? error.message : String(error);
			const encodedMessage = encodeBase64(message);
			command += `echo "${encodedMessage}" | base64 -d >> "${deployment.logPath}";`;
		}

		command += `echo "\nError occurred ❌, check the logs for details." >> ${deployment.logPath};`;
		const serverId = application.buildServerId || application.serverId;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}

		// Never let a failing status comment hide the actual build error.
		await writePreviewComment("error").catch((commentError) => {
			console.error(
				"Error reporting the preview deployment failure:",
				commentError,
			);
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "error",
		});
		throw error;
	}

	return true;
};

// Matches the literal `dokploy` bucket plus `dokploy-<serverId>` where the
// suffix is the same character set as a nanoid (alphanumeric + `_`/`-`).
// Used as a defense-in-depth guard before treating `appName` as a host-stats
// directory under MONITORING_PATH.
// The {21} length constraint matches the default nanoid() output exactly, so
// names like `dokploy-traefik` cannot be mis-routed through host-stats lookup.
const DOKPLOY_HOST_STATS_PATTERN = /^dokploy(-[A-Za-z0-9_-]{21})?$/;

export const getApplicationStats = async (appName: string) => {
	// "dokploy" = main server host stats; "dokploy-<serverId>" = remote
	// server host stats. Both read from MONITORING_PATH/<appName>/*.json
	// directly without going through a Docker container lookup.
	if (DOKPLOY_HOST_STATS_PATTERN.test(appName)) {
		return await getAdvancedStats(appName);
	}
	const filter = {
		status: ["running"],
		label: [`com.docker.swarm.service.name=${appName}`],
	};

	const containers = await docker.listContainers({
		filters: JSON.stringify(filter),
	});

	const container = containers[0];
	if (!container || container?.State !== "running") {
		return null;
	}

	const data = await getAdvancedStats(appName);

	return data;
};
