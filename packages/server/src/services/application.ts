import path from "node:path";
import { docker, paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateApplication,
	applications,
	buildAppName,
	deployments,
	network,
} from "@dokploy/server/db/schema";
import { getAdvancedStats } from "@dokploy/server/monitoring/utils";
import {
	getBuildCommand,
	mechanizeDockerContainer,
} from "@dokploy/server/utils/builders";
import { removeFileOrDirectory } from "@dokploy/server/utils/filesystem/directory";
import { sendBuildErrorNotifications } from "@dokploy/server/utils/notifications/build-error";
import { getBuildErrorMessage } from "@dokploy/server/utils/notifications/build-error-message";
import { sendBuildSuccessNotifications } from "@dokploy/server/utils/notifications/build-success";
import {
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
import {
	createTraefikConfig,
	readConfig,
	readRemoteConfig,
	removeTraefikConfig,
	writeConfig,
	writeConfigRemote,
} from "@dokploy/server/utils/traefik/application";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import { removeForwardAuthMiddleware } from "@dokploy/server/utils/traefik/forward-auth";
import {
	deleteAllMiddlewares,
	removePathMiddlewares,
} from "@dokploy/server/utils/traefik/middleware";
import { createRedirectMiddleware } from "@dokploy/server/utils/traefik/redirect";
import { createSecurityMiddleware } from "@dokploy/server/utils/traefik/security";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { quote } from "shell-quote";
import type { z } from "zod";
import { getDokployUrl } from "./admin";
import {
	createDeployment,
	createDeploymentPreview,
	updateDeployment,
	updateDeploymentStatus,
	writeDeploymentErrorLog,
} from "./deployment";
import { type Domain, getDomainHost } from "./domain";
import {
	createPreviewDeploymentComment,
	getIssueComment,
	issueCommentExists,
	updateIssueComment,
} from "./github";
import { createFileMount } from "./mount";
import { generateApplyPatchesCommand } from "./patch";
import {
	findPreviewDeploymentById,
	updatePreviewDeployment,
} from "./preview-deployment";
import { validUniqueServerAppName } from "./project";
import { findServerById } from "./server";
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

const removeServiceFileMount = async (
	mount: { filePath?: string | null },
	appName: string,
	serverId: string | null,
) => {
	if (!mount.filePath) return;
	try {
		const { APPLICATIONS_PATH } = paths(!!serverId);
		const basePath = path.join(
			path.resolve(APPLICATIONS_PATH),
			appName,
			"files",
		);
		const fullPath = path.join(basePath, mount.filePath);

		if (serverId) {
			const command = `rm -rf ${quote([fullPath])}`;
			await execAsyncRemote(serverId, command);
		} else {
			await removeFileOrDirectory(fullPath);
		}
	} catch (error) {
		console.error("Error removing file mount:", error);
	}
};

export const canChangeApplicationServer = (application: {
	applicationStatus: Application["applicationStatus"];
	deployments?: Array<unknown> | null;
}) => {
	return (
		application.applicationStatus === "idle" &&
		(!application.deployments || application.deployments.length === 0)
	);
};

export const changeApplicationServer = async (
	applicationId: string,
	newServerId: string | null,
) => {
	const application = await findApplicationById(applicationId);
	const currentServerId = application.serverId ?? null;
	const targetServerId = newServerId ?? null;

	if (currentServerId === targetServerId) {
		return application;
	}

	if (!canChangeApplicationServer(application)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Cannot change the server after the application has been deployed. Please use the Transfer Service to migrate it.",
		});
	}

	if (targetServerId) {
		const targetServer = await findServerById(targetServerId);
		if (
			targetServer.serverStatus !== "active" ||
			targetServer.serverType !== "deploy"
		) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"The selected server is not active or not available for deployments",
			});
		}
	}

	const [locked] = await db
		.update(applications)
		.set({ applicationStatus: "running" })
		.where(
			and(
				eq(applications.applicationId, applicationId),
				eq(applications.applicationStatus, "idle"),
			),
		)
		.returning();

	if (!locked) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Application is currently busy or running a deployment. Cannot change server.",
		});
	}

	let switched = false;
	let existingTraefikConfig: string | null = null;
	const originalNetworkIds = application.networkIds;

	try {
		const existingDeployments = await db.query.deployments.findMany({
			where: eq(deployments.applicationId, applicationId),
			columns: { deploymentId: true },
			limit: 1,
		});

		if (existingDeployments.length > 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"Cannot change the server after the application has been deployed. Please use the Transfer Service to migrate it.",
			});
		}

		existingTraefikConfig = application.serverId
			? await readRemoteConfig(application.serverId, application.appName)
			: readConfig(application.appName);

		let updatedNetworkIds = application.networkIds;
		if (application.networkIds && application.networkIds.length > 0) {
			const rows = await db.query.network.findMany({
				where: inArray(network.networkId, application.networkIds),
				columns: { networkId: true, serverId: true },
			});
			updatedNetworkIds = rows
				.filter((row) => (row.serverId ?? null) === targetServerId)
				.map((row) => row.networkId);
		}

		await updateApplication(applicationId, {
			serverId: targetServerId,
			networkIds: updatedNetworkIds,
		});
		switched = true;

		if (existingTraefikConfig) {
			if (targetServerId) {
				await writeConfigRemote(
					targetServerId,
					application.appName,
					existingTraefikConfig,
				);
			} else {
				writeConfig(application.appName, existingTraefikConfig);
			}
		}

		if (application.domains.length > 0) {
			const movedApp = await findApplicationById(applicationId);
			for (const domain of movedApp.domains) {
				await manageDomain(movedApp, domain);
			}
			for (const security of movedApp.security) {
				await createSecurityMiddleware(movedApp, security);
			}
			for (const redirect of movedApp.redirects) {
				await createRedirectMiddleware(movedApp, redirect);
			}
		}

		if (application.mounts.length > 0) {
			for (const mount of application.mounts) {
				if (mount.type === "file") {
					await createFileMount(mount.mountId);
				}
			}
		}

		if (application.domains.length > 0) {
			try {
				for (const domain of application.domains) {
					await removePathMiddlewares(application, domain.uniqueConfigKey);
					await removeForwardAuthMiddleware(
						application,
						domain.uniqueConfigKey,
					);
				}
				await deleteAllMiddlewares(application);
			} catch (error) {
				console.error("Error removing Traefik middlewares from source:", error);
			}
		}

		if (existingTraefikConfig || application.domains.length > 0) {
			try {
				await removeTraefikConfig(application.appName, application.serverId);
			} catch (error) {
				console.error("Error removing Traefik config from source:", error);
			}
		}

		if (application.mounts.length > 0) {
			for (const mount of application.mounts) {
				if (mount.type === "file") {
					await removeServiceFileMount(
						mount,
						application.appName,
						currentServerId,
					);
				}
			}
		}

		const updated = await findApplicationById(applicationId);
		return updated;
	} catch (error) {
		if (switched) {
			try {
				await updateApplication(applicationId, {
					serverId: currentServerId,
					networkIds: originalNetworkIds,
				});
			} catch (rollbackError) {
				console.error(
					"Error rolling back application server update:",
					rollbackError,
				);
			}

			try {
				if (existingTraefikConfig || application.domains.length > 0) {
					await removeTraefikConfig(application.appName, targetServerId);
				}
				if (application.mounts.length > 0) {
					for (const mount of application.mounts) {
						if (mount.type === "file") {
							await removeServiceFileMount(
								mount,
								application.appName,
								targetServerId,
							);
						}
					}
				}
			} catch (cleanupError) {
				console.error(
					"Error cleaning up target server after failed server change:",
					cleanupError,
				);
			}
		}
		throw error;
	} finally {
		await updateApplicationStatus(applicationId, "idle");
	}
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
	const applicationEntity = {
		...application,
		serverId: serverId,
	};

	const buildLink = `${await getDokployUrl()}/dashboard/project/${application.environment.projectId}/environment/${application.environmentId}/services/application/${application.applicationId}?tab=deployments`;
	const deployment = await createDeployment({
		applicationId: applicationId,
		title: titleLog,
		description: descriptionLog,
	});

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
		const errorMessage = await getBuildErrorMessage(
			error,
			deployment.logPath,
			serverId,
		);
		await writeDeploymentErrorLog(deployment, serverId, error);
		await updateDeploymentStatus(deployment.deploymentId, "error");
		await updateApplicationStatus(applicationId, "error");

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
		await writeDeploymentErrorLog(deployment, serverId, error);
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
		application.rollbackRegistry = null;

		const serverId = application.buildServerId || application.serverId;
		let command = "set -e;";
		if (application.sourceType === "github") {
			command += await cloneGithubRepository({
				...application,
				serverId,
				appName: previewDeployment.appName,
				branch: previewDeployment.branch,
			});
			command += await getBuildCommand(application);

			const commandWithLog = `(${command}) >> ${deployment.logPath} 2>&1`;
			if (serverId) {
				await execAsyncRemote(serverId, commandWithLog);
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
		application.rollbackRegistry = null;

		const serverId = application.buildServerId || application.serverId;
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
		const serverId = application.buildServerId || application.serverId;
		await writeDeploymentErrorLog(deployment, serverId, error);

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
