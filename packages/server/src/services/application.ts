import { docker } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateApplication,
	applications,
	buildAppName,
} from "@dokploy/server/db/schema";
import { getAdvancedStats } from "@dokploy/server/monitoring/utils";
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
import { encodeBase64 } from "../utils/docker/utils";
import { getDokployUrl } from "./admin";
import {
	createDeployment,
	createDeploymentPreview,
	updateDeployment,
	updateDeploymentStatus,
} from "./deployment";
import { type Domain, getDomainHost } from "./domain";
import {
	createPreviewDeploymentComment,
	getIssueComment,
	issueCommentExists,
	updateIssueComment,
} from "./github";
import {
	findPreviewDeploymentById,
	updatePreviewDeployment,
} from "./preview-deployment";
import { validUniqueServerAppName } from "./project";
export type Application = typeof applications.$inferSelect;

export const createApplication = async (
	input: typeof apiCreateApplication._type,
) => {
	const appName = buildAppName("app", input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Application with this 'AppName' already exists",
		});
	}

	return await db.transaction(async (tx) => {
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
};

export const findApplicationById = async (applicationId: string) => {
	const application = await db.query.applications.findFirst({
		where: eq(applications.applicationId, applicationId),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			domains: true,
			deployments: true,
			mounts: true,
			redirects: true,
			security: true,
			ports: true,
			registry: true,
			gitlab: true,
			github: true,
			bitbucket: true,
			gitea: true,
			server: true,
			previewDeployments: true,
			buildRegistry: true,
			rollbackRegistry: true,
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
	const serverId = application.buildServerId || application.serverId;

	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;
	const deployment = await createDeployment({
		applicationId: applicationId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		let command = "set -e;";
		if (application.sourceType === "github") {
			command += await cloneGithubRepository(application);
		} else if (application.sourceType === "gitlab") {
			command += await cloneGitlabRepository(application);
		} else if (application.sourceType === "gitea") {
			command += await cloneGiteaRepository(application);
		} else if (application.sourceType === "bitbucket") {
			command += await cloneBitbucketRepository(application);
		} else if (application.sourceType === "git") {
			command += await cloneGitRepository(application);
		} else if (application.sourceType === "docker") {
			command += await buildRemoteDocker(application);
		}

		command += await getBuildCommand(application);

		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}

		await mechanizeDockerContainer(application);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateApplicationStatus(applicationId, "done");

		await sendBuildSuccessNotifications({
			projectName: application.environment.project.name,
			applicationName: application.name,
			applicationType: "application",
			buildLink,
			organizationId: application.environment.project.organizationId,
			domains: application.domains,
			environmentName: application.environment.name,
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
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");

		await sendBuildErrorNotifications({
			projectName: application.environment.project.name,
			applicationName: application.name,
			applicationType: "application",
			// @ts-ignore
			errorMessage: error?.message || "Error building",
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
	const serverId = application.buildServerId || application.serverId;
	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;

	const deployment = await createDeployment({
		applicationId: applicationId,
		title: titleLog,
		description: descriptionLog,
	});

	try {
		let command = "set -e;";
		// Check case for docker only
		command += await getBuildCommand(application);
		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
		await mechanizeDockerContainer(application);
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updateApplicationStatus(applicationId, "done");

		await sendBuildSuccessNotifications({
			projectName: application.environment.project.name,
			applicationName: application.name,
			applicationType: "application",
			buildLink,
			organizationId: application.environment.project.organizationId,
			domains: application.domains,
			environmentName: application.environment.name,
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

	const deployment = await createDeploymentPreview({
		title: titleLog,
		description: descriptionLog,
		previewDeploymentId: previewDeploymentId,
	});

	const previewDeployment =
		await findPreviewDeploymentById(previewDeploymentId);

	await updatePreviewDeployment(previewDeploymentId, {
		createdAt: new Date().toISOString(),
	});

	const previewDomain = getDomainHost(previewDeployment?.domain as Domain);
	const issueParams = {
		owner: application?.owner || "",
		repository: application?.repository || "",
		issue_number: previewDeployment.pullRequestNumber,
		comment_id: Number.parseInt(previewDeployment.pullRequestCommentId),
		githubId: application?.githubId || "",
	};
	try {
		const commentExists = await issueCommentExists({
			...issueParams,
		});
		if (!commentExists) {
			const result = await createPreviewDeploymentComment({
				...issueParams,
				previewDomain,
				appName: previewDeployment.appName,
				githubId: application?.githubId || "",
				previewDeploymentId,
			});

			if (!result) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Pull request comment not found",
				});
			}

			issueParams.comment_id = Number.parseInt(result?.pullRequestCommentId);
		}
		const buildingComment = getIssueComment(
			application.name,
			"running",
			previewDomain,
		);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${buildingComment}`,
		});
		application.appName = previewDeployment.appName;
		application.env = `${application.previewEnv}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.buildArgs = `${application.previewBuildArgs}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.buildSecrets = `${application.previewBuildSecrets}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.rollbackActive = false;
		application.buildRegistry = null;
		application.rollbackRegistry = null;
		application.registry = null;

		let command = "set -e;";
		if (application.sourceType === "github") {
			command += await cloneGithubRepository({
				...application,
				appName: previewDeployment.appName,
				branch: previewDeployment.branch,
			});
			command += await getBuildCommand(application);

			const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
			if (application.serverId) {
				await execAsyncRemote(application.serverId, commandWithLog);
			} else {
				await execAsync(commandWithLog);
			}
			await mechanizeDockerContainer(application);
		}
		const successComment = getIssueComment(
			application.name,
			"success",
			previewDomain,
		);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${successComment}`,
		});
		await updateDeploymentStatus(deployment.deploymentId, "done");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "done",
		});
	} catch (error) {
		const comment = getIssueComment(application.name, "error", previewDomain);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${comment}`,
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

	const deployment = await createDeploymentPreview({
		title: titleLog,
		description: descriptionLog,
		previewDeploymentId: previewDeploymentId,
	});

	const previewDomain = getDomainHost(previewDeployment?.domain as Domain);
	const issueParams = {
		owner: application?.owner || "",
		repository: application?.repository || "",
		issue_number: previewDeployment.pullRequestNumber,
		comment_id: Number.parseInt(previewDeployment.pullRequestCommentId),
		githubId: application?.githubId || "",
	};

	try {
		const commentExists = await issueCommentExists({
			...issueParams,
		});
		if (!commentExists) {
			const result = await createPreviewDeploymentComment({
				...issueParams,
				previewDomain,
				appName: previewDeployment.appName,
				githubId: application?.githubId || "",
				previewDeploymentId,
			});

			if (!result) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Pull request comment not found",
				});
			}

			issueParams.comment_id = Number.parseInt(result?.pullRequestCommentId);
		}

		const buildingComment = getIssueComment(
			application.name,
			"running",
			previewDomain,
		);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${buildingComment}`,
		});

		// Set application properties for preview deployment
		application.appName = previewDeployment.appName;
		application.env = `${application.previewEnv}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.buildArgs = `${application.previewBuildArgs}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.buildSecrets = `${application.previewBuildSecrets}\nDOKPLOY_DEPLOY_URL=${previewDeployment?.domain?.host}`;
		application.rollbackActive = false;
		application.buildRegistry = null;
		application.rollbackRegistry = null;
		application.registry = null;

		const serverId = application.serverId;
		let command = "set -e;";
		// Only rebuild, don't clone repository
		command += await getBuildCommand(application);
		const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
		if (serverId) {
			await execAsyncRemote(serverId, commandWithLog);
		} else {
			await execAsync(commandWithLog);
		}
		await mechanizeDockerContainer(application);

		const successComment = getIssueComment(
			application.name,
			"success",
			previewDomain,
		);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${successComment}`,
		});
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

		const comment = getIssueComment(application.name, "error", previewDomain);
		await updateIssueComment({
			...issueParams,
			body: `### Dokploy Preview Deployment\n\n${comment}`,
		});
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updatePreviewDeployment(previewDeploymentId, {
			previewStatus: "error",
		});
		throw error;
	}

	return true;
};

export const getApplicationStats = async (appName: string) => {
	if (appName === "dokploy") {
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
