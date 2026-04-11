import {
	clearOldDeployments,
	createApplication,
	deleteAllMiddlewares,
	findApplicationById,
	findEnvironmentById,
	findGitProviderById,
	findProjectById,
	getAccessibleServerIds,
	getApplicationStats,
	getContainerLogs,
	IS_CLOUD,
	mechanizeDockerContainer,
	readConfig,
	readRemoteConfig,
	removeDeployments,
	removeDirectoryCode,
	removeMonitoringDirectory,
	removeService,
	removeTraefikConfig,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	unzipDrop,
	updateApplication,
	updateApplicationStatus,
	updateDeploymentStatus,
	writeConfig,
	writeConfigRemote,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { zfd } from "zod-form-data";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateApplication,
	apiDeployApplication,
	apiFindMonitoringStats,
	apiFindOneApplication,
	apiRedeployApplication,
	apiReloadApplication,
	apiSaveBitbucketProvider,
	apiSaveBuildType,
	apiSaveDockerProvider,
	apiSaveEnvironmentVariables,
	apiSaveGiteaProvider,
	apiSaveGithubProvider,
	apiSaveGitlabProvider,
	apiSaveGitProvider,
	apiUpdateApplication,
	applications,
	environments,
	projects,
} from "@/server/db/schema";
import { deploymentWorker } from "@/server/queues/deployments-queue";
import type { DeploymentJob } from "@/server/queues/queue-types";
import {
	cleanQueuesByApplication,
	getJobsByApplicationId,
	killDockerBuild,
	myQueue,
} from "@/server/queues/queueSetup";
import { cancelDeployment, deploy } from "@/server/utils/deploy";

export const applicationRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create an application",
				description: "Creates a new application in the specified project environment. Supports GitHub, GitLab, Bitbucket, Git, Docker image, and drop sources.",
			},
		})
		.input(apiCreateApplication)
		.mutation(async ({ input, ctx }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create an application",
					});
				}

				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}

				if (input.serverId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.serverId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this server",
						});
					}
				}

				const newApplication = await createApplication(input);

				await addNewService(ctx, newApplication.applicationId);
				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newApplication.applicationId,
					resourceName: newApplication.appName,
				});
				return newApplication;
			} catch (error: unknown) {
				console.log("error", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the application",
					cause: error,
				});
			}
		}),
	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get an application",
				description: "Retrieves detailed information about an application by its ID, including git provider access status and deployment configuration.",
			},
		})
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.applicationId, "read");
			const application = await findApplicationById(input.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}

			let hasGitProviderAccess = true;
			let unauthorizedProvider: string | null = null;

			const getGitProviderId = () => {
				switch (application.sourceType) {
					case "github":
						return application.github?.gitProviderId;
					case "gitlab":
						return application.gitlab?.gitProviderId;
					case "bitbucket":
						return application.bitbucket?.gitProviderId;
					case "gitea":
						return application.gitea?.gitProviderId;
					default:
						return null;
				}
			};

			const gitProviderId = getGitProviderId();

			if (gitProviderId) {
				try {
					const gitProvider = await findGitProviderById(gitProviderId);
					if (gitProvider.userId !== ctx.session.userId) {
						hasGitProviderAccess = false;
						unauthorizedProvider = application.sourceType;
					}
				} catch {
					hasGitProviderAccess = false;
					unauthorizedProvider = application.sourceType;
				}
			}

			return {
				...application,
				hasGitProviderAccess,
				unauthorizedProvider,
			};
		}),

	reload: protectedProcedure
		.meta({
			openapi: {
				summary: "Reload an application",
				description: "Restarts the Docker container for the application by mechanizing it. Resets the application status to idle, then to done on success or error on failure.",
			},
		})
		.input(apiReloadApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const application = await findApplicationById(input.applicationId);

			try {
				await updateApplicationStatus(input.applicationId, "idle");
				await mechanizeDockerContainer(application);
				await updateApplicationStatus(input.applicationId, "done");
				await audit(ctx, {
					action: "reload",
					resourceType: "application",
					resourceId: application.applicationId,
					resourceName: application.appName,
				});
				return true;
			} catch (error) {
				await updateApplicationStatus(input.applicationId, "error");
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Error reloading application",
					cause: error,
				});
			}
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete an application",
				description: "Permanently deletes an application and cleans up all associated resources including Docker services, Traefik configuration, deployments, middlewares, and source code.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.applicationId, "delete");
			const application = await findApplicationById(input.applicationId);

			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this application",
				});
			}

			const result = await db
				.delete(applications)
				.where(eq(applications.applicationId, input.applicationId))
				.returning();

			if (!IS_CLOUD) {
				const queueJobs = await getJobsByApplicationId(input.applicationId);
				for (const job of queueJobs) {
					if (job.id) {
						deploymentWorker.cancelJob(job.id, "User requested cancellation");
					}
				}
			}

			const cleanupOperations = [
				async () => await deleteAllMiddlewares(application),
				async () => await removeDeployments(application),
				async () =>
					await removeDirectoryCode(application.appName, application.serverId),
				async () =>
					await removeMonitoringDirectory(
						application.appName,
						application.serverId,
					),
				async () =>
					await removeTraefikConfig(application.appName, application.serverId),
				async () =>
					await removeService(application?.appName, application.serverId),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return application;
		}),

	stop: protectedProcedure
		.meta({
			openapi: {
				summary: "Stop an application",
				description: "Stops the running Docker service for the application and sets its status to idle.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const service = await findApplicationById(input.applicationId);
			if (service.serverId) {
				await stopServiceRemote(service.serverId, service.appName);
			} else {
				await stopService(service.appName);
			}
			await updateApplicationStatus(input.applicationId, "idle");
			await audit(ctx, {
				action: "stop",
				resourceType: "application",
				resourceId: service.applicationId,
				resourceName: service.appName,
			});
			return service;
		}),

	start: protectedProcedure
		.meta({
			openapi: {
				summary: "Start an application",
				description: "Starts the Docker service for the application and sets its status to done.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const service = await findApplicationById(input.applicationId);
			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateApplicationStatus(input.applicationId, "done");
			await audit(ctx, {
				action: "start",
				resourceType: "application",
				resourceId: service.applicationId,
				resourceName: service.appName,
			});
			return service;
		}),

	redeploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Redeploy an application",
				description: "Triggers a rebuild and redeployment of the application. Queues a deployment job or executes it directly for cloud servers.",
			},
		})
		.input(apiRedeployApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const application = await findApplicationById(input.applicationId);
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: input.title || "Rebuild deployment",
				descriptionLog: input.description || "",
				type: "redeploy",
				applicationType: "application",
				server: !!application.serverId,
			};

			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				await audit(ctx, {
					action: "rebuild",
					resourceType: "application",
					resourceId: application.applicationId,
					resourceName: application.appName,
				});
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
			await audit(ctx, {
				action: "rebuild",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
		}),
	saveEnvironment: protectedProcedure
		.meta({
			openapi: {
				summary: "Save environment variables",
				description: "Updates the environment variables, build arguments, and build secrets for an application.",
			},
		})
		.input(apiSaveEnvironmentVariables)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				envVars: ["write"],
			});
			await updateApplication(input.applicationId, {
				env: input.env,
				buildArgs: input.buildArgs,
				buildSecrets: input.buildSecrets,
				createEnvFile: input.createEnvFile,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveBuildType: protectedProcedure
		.meta({
			openapi: {
				summary: "Save build type configuration",
				description: "Updates the build type and related settings for an application, including Dockerfile path, build context, publish directory, and build stage.",
			},
		})
		.input(apiSaveBuildType)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				buildType: input.buildType,
				dockerfile: input.dockerfile,
				publishDirectory: input.publishDirectory,
				dockerContextPath: input.dockerContextPath,
				dockerBuildStage: input.dockerBuildStage,
				herokuVersion: input.herokuVersion,
				isStaticSpa: input.isStaticSpa,
				railpackVersion: input.railpackVersion,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveGithubProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save GitHub provider",
				description: "Configures the application to use a GitHub repository as its source, setting the repository, branch, owner, and build path.",
			},
		})
		.input(apiSaveGithubProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				repository: input.repository,
				branch: input.branch,
				sourceType: "github",
				owner: input.owner,
				buildPath: input.buildPath,
				applicationStatus: "idle",
				githubId: input.githubId,
				watchPaths: input.watchPaths,
				triggerType: input.triggerType,
				enableSubmodules: input.enableSubmodules,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveGitlabProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save GitLab provider",
				description: "Configures the application to use a GitLab repository as its source, setting the repository, branch, owner, build path, and project ID.",
			},
		})
		.input(apiSaveGitlabProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				gitlabRepository: input.gitlabRepository,
				gitlabOwner: input.gitlabOwner,
				gitlabBranch: input.gitlabBranch,
				gitlabBuildPath: input.gitlabBuildPath,
				sourceType: "gitlab",
				applicationStatus: "idle",
				gitlabId: input.gitlabId,
				gitlabProjectId: input.gitlabProjectId,
				gitlabPathNamespace: input.gitlabPathNamespace,
				watchPaths: input.watchPaths,
				enableSubmodules: input.enableSubmodules,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveBitbucketProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save Bitbucket provider",
				description: "Configures the application to use a Bitbucket repository as its source, setting the repository, branch, owner, and build path.",
			},
		})
		.input(apiSaveBitbucketProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				bitbucketRepository: input.bitbucketRepository,
				bitbucketRepositorySlug: input.bitbucketRepositorySlug,
				bitbucketOwner: input.bitbucketOwner,
				bitbucketBranch: input.bitbucketBranch,
				bitbucketBuildPath: input.bitbucketBuildPath,
				sourceType: "bitbucket",
				applicationStatus: "idle",
				bitbucketId: input.bitbucketId,
				watchPaths: input.watchPaths,
				enableSubmodules: input.enableSubmodules,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveGiteaProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save Gitea provider",
				description: "Configures the application to use a Gitea repository as its source, setting the repository, branch, owner, and build path.",
			},
		})
		.input(apiSaveGiteaProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				giteaRepository: input.giteaRepository,
				giteaOwner: input.giteaOwner,
				giteaBranch: input.giteaBranch,
				giteaBuildPath: input.giteaBuildPath,
				sourceType: "gitea",
				applicationStatus: "idle",
				giteaId: input.giteaId,
				watchPaths: input.watchPaths,
				enableSubmodules: input.enableSubmodules,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveDockerProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save Docker provider",
				description: "Configures the application to use a Docker image as its source, setting the image name, registry URL, and optional credentials.",
			},
		})
		.input(apiSaveDockerProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				dockerImage: input.dockerImage,
				username: input.username,
				password: input.password,
				sourceType: "docker",
				applicationStatus: "idle",
				registryUrl: input.registryUrl,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	saveGitProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Save Git provider",
				description: "Configures the application to use a custom Git repository URL as its source, with optional SSH key authentication.",
			},
		})
		.input(apiSaveGitProvider)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				customGitBranch: input.customGitBranch,
				customGitBuildPath: input.customGitBuildPath,
				customGitUrl: input.customGitUrl,
				customGitSSHKeyId: input.customGitSSHKeyId,
				sourceType: "git",
				applicationStatus: "idle",
				watchPaths: input.watchPaths,
				enableSubmodules: input.enableSubmodules,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	disconnectGitProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Disconnect git provider",
				description: "Removes all git provider configuration from the application, resetting source type to default and clearing repository, branch, and owner fields for all providers.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				repository: null,
				branch: null,
				owner: null,
				buildPath: "/",
				githubId: null,
				triggerType: "push",

				gitlabRepository: null,
				gitlabOwner: null,
				gitlabBranch: null,
				gitlabBuildPath: null,
				gitlabId: null,
				gitlabProjectId: null,
				gitlabPathNamespace: null,

				bitbucketRepository: null,
				bitbucketOwner: null,
				bitbucketBranch: null,
				bitbucketBuildPath: null,
				bitbucketId: null,

				giteaRepository: null,
				giteaOwner: null,
				giteaBranch: null,
				giteaBuildPath: null,
				giteaId: null,

				customGitBranch: null,
				customGitBuildPath: null,
				customGitUrl: null,
				customGitSSHKeyId: null,

				sourceType: "github", // Reset to default
				applicationStatus: "idle",
				watchPaths: null,
				enableSubmodules: false,
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	markRunning: protectedProcedure
		.meta({
			openapi: {
				summary: "Mark application as running",
				description: "Sets the application status to running. Used to indicate that a deployment is in progress.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			await updateApplicationStatus(input.applicationId, "running");
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "deploy",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
		}),
	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update an application",
				description: "Updates the general configuration of an application such as name, description, memory limits, CPU limits, and other settings.",
			},
		})
		.input(apiUpdateApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});

			if (input.buildServerId) {
				const accessibleIds = await getAccessibleServerIds(ctx.session);
				if (!accessibleIds.has(input.buildServerId)) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this build server",
					});
				}
			}

			const { applicationId, ...rest } = input;
			const updateApp = await updateApplication(applicationId, {
				...rest,
			});

			if (!updateApp) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating application",
				});
			}
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: updateApp.applicationId,
				resourceName: updateApp.appName,
			});
			return true;
		}),
	refreshToken: protectedProcedure
		.meta({
			openapi: {
				summary: "Refresh deploy token",
				description: "Regenerates the webhook refresh token for the application, invalidating the previous token used for triggering deployments.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await updateApplication(input.applicationId, {
				refreshToken: nanoid(),
			});
			const application = await findApplicationById(input.applicationId);
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	deploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy an application",
				description: "Triggers a new deployment for the application. Queues a deployment job or executes it directly for cloud servers.",
			},
		})
		.input(apiDeployApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const application = await findApplicationById(input.applicationId);
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: input.title || "Manual deployment",
				descriptionLog: input.description || "",
				type: "deploy",
				applicationType: "application",
				server: !!application.serverId,
			};
			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				await audit(ctx, {
					action: "deploy",
					resourceType: "application",
					resourceId: application.applicationId,
					resourceName: application.appName,
				});
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
			await audit(ctx, {
				action: "deploy",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
		}),

	cleanQueues: protectedProcedure
		.meta({
			openapi: {
				summary: "Clean deployment queues",
				description: "Removes all pending deployment jobs from the queue for the specified application.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["cancel"],
			});
			await cleanQueuesByApplication(input.applicationId);
		}),
	clearDeployments: protectedProcedure
		.meta({
			openapi: {
				summary: "Clear old deployments",
				description: "Removes old deployment logs and artifacts for the application to free up disk space.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const application = await findApplicationById(input.applicationId);
			await clearOldDeployments(application.appName, application.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	killBuild: protectedProcedure
		.meta({
			openapi: {
				summary: "Kill active build",
				description: "Forcefully terminates the currently running Docker build process for the application.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["cancel"],
			});
			const application = await findApplicationById(input.applicationId);
			await killDockerBuild("application", application.serverId);
			await audit(ctx, {
				action: "stop",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
		}),
	readTraefikConfig: protectedProcedure
		.meta({
			openapi: {
				summary: "Read Traefik configuration",
				description: "Reads the current Traefik reverse proxy configuration file for the application. Supports both local and remote server configurations.",
			},
		})
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				traefikFiles: ["read"],
			});
			const application = await findApplicationById(input.applicationId);
			let traefikConfig = null;
			if (application.serverId) {
				traefikConfig = await readRemoteConfig(
					application.serverId,
					application.appName,
				);
			} else {
				traefikConfig = readConfig(application.appName);
			}
			return traefikConfig;
		}),

	dropDeployment: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy from zip upload",
				description: "Deploys an application from an uploaded zip file. Unzips the file into the application directory and triggers a deployment.",
			},
		})
		.input(
			zfd.formData({
				applicationId: z.string(),
				zip: zfd.file(),
				dropBuildPath: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const zipFile = input.zip;
			const applicationId = input.applicationId;
			const dropBuildPath = input.dropBuildPath ?? null;

			await checkServicePermissionAndAccess(ctx, applicationId, {
				deployment: ["create"],
			});
			const app = await findApplicationById(applicationId);

			await updateApplication(applicationId, {
				sourceType: "drop",
				dropBuildPath: dropBuildPath || "",
			});

			await unzipDrop(zipFile, app);
			const jobData: DeploymentJob = {
				applicationId: app.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: !!app.serverId,
			};
			if (IS_CLOUD && app.serverId) {
				jobData.serverId = app.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				return true;
			}

			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
			await audit(ctx, {
				action: "deploy",
				resourceType: "application",
				resourceId: app.applicationId,
				resourceName: app.appName,
			});
			return true;
		}),
	updateTraefikConfig: protectedProcedure
		.meta({
			openapi: {
				summary: "Update Traefik configuration",
				description: "Writes a new Traefik reverse proxy configuration for the application. Supports both local and remote server configurations.",
			},
		})
		.input(z.object({ applicationId: z.string(), traefikConfig: z.string() }))
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				traefikFiles: ["write"],
			});
			const application = await findApplicationById(input.applicationId);
			if (application.serverId) {
				await writeConfigRemote(
					application.serverId,
					application.appName,
					input.traefikConfig,
				);
			} else {
				writeConfig(application.appName, input.traefikConfig);
			}
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			return true;
		}),
	readAppMonitoring: withPermission("monitoring", "read")
		.meta({
			openapi: {
				summary: "Read application monitoring stats",
				description: "Retrieves CPU and memory monitoring statistics for the application. Only available in self-hosted mode.",
			},
		})
		.input(apiFindMonitoringStats)
		.query(async ({ input }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Functionality not available in cloud version",
				});
			}
			const stats = await getApplicationStats(input.appName);

			return stats;
		}),
	move: protectedProcedure
		.meta({
			openapi: {
				summary: "Move application to another environment",
				description: "Moves an application to a different environment within the same project or to another project's environment.",
			},
		})
		.input(
			z.object({
				applicationId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});

			const updatedApplication = await db
				.update(applications)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(applications.applicationId, input.applicationId))
				.returning()
				.then((res) => res[0]);

			if (!updatedApplication) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move application",
				});
			}
			await audit(ctx, {
				action: "update",
				resourceType: "application",
				resourceId: updatedApplication.applicationId,
				resourceName: updatedApplication.appName,
			});
			return updatedApplication;
		}),

	cancelDeployment: protectedProcedure
		.meta({
			openapi: {
				summary: "Cancel a deployment",
				description: "Cancels an in-progress deployment for the application and resets its status to idle. Only available in cloud version.",
			},
		})
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["cancel"],
			});
			const application = await findApplicationById(input.applicationId);

			if (IS_CLOUD && application.serverId) {
				try {
					await updateApplicationStatus(input.applicationId, "idle");

					if (application.deployments[0]) {
						await updateDeploymentStatus(
							application.deployments[0].deploymentId,
							"done",
						);
					}

					await cancelDeployment({
						applicationId: input.applicationId,
						applicationType: "application",
					});
					await audit(ctx, {
						action: "stop",
						resourceType: "application",
						resourceId: application.applicationId,
						resourceName: application.appName,
					});
					return {
						success: true,
						message: "Deployment cancellation requested",
					};
				} catch (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							error instanceof Error
								? error.message
								: "Failed to cancel deployment",
					});
				}
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Deployment cancellation only available in cloud version",
			});
		}),

	search: protectedProcedure
		.meta({
			openapi: {
				summary: "Search applications",
				description: "Searches applications by name, appName, description, repository, owner, or Docker image with pagination. Respects service-level access control.",
			},
		})
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				appName: z.string().optional(),
				description: z.string().optional(),
				repository: z.string().optional(),
				owner: z.string().optional(),
				dockerImage: z.string().optional(),
				projectId: z.string().optional(),
				environmentId: z.string().optional(),
				limit: z.number().min(1).max(100).default(20),
				offset: z.number().min(0).default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			const baseConditions = [
				eq(projects.organizationId, ctx.session.activeOrganizationId),
			];

			if (input.projectId) {
				baseConditions.push(eq(environments.projectId, input.projectId));
			}
			if (input.environmentId) {
				baseConditions.push(
					eq(applications.environmentId, input.environmentId),
				);
			}

			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(applications.name, term),
						ilike(applications.appName, term),
						ilike(applications.description ?? "", term),
						ilike(applications.repository ?? "", term),
						ilike(applications.owner ?? "", term),
						ilike(applications.dockerImage ?? "", term),
					)!,
				);
			}

			if (input.name?.trim()) {
				baseConditions.push(ilike(applications.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(applications.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						applications.description ?? "",
						`%${input.description.trim()}%`,
					),
				);
			}
			if (input.repository?.trim()) {
				baseConditions.push(
					ilike(applications.repository ?? "", `%${input.repository.trim()}%`),
				);
			}
			if (input.owner?.trim()) {
				baseConditions.push(
					ilike(applications.owner ?? "", `%${input.owner.trim()}%`),
				);
			}
			if (input.dockerImage?.trim()) {
				baseConditions.push(
					ilike(
						applications.dockerImage ?? "",
						`%${input.dockerImage.trim()}%`,
					),
				);
			}

			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${applications.applicationId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);

			const [items, countResult] = await Promise.all([
				db
					.select({
						applicationId: applications.applicationId,
						name: applications.name,
						appName: applications.appName,
						description: applications.description,
						environmentId: applications.environmentId,
						applicationStatus: applications.applicationStatus,
						sourceType: applications.sourceType,
						createdAt: applications.createdAt,
					})
					.from(applications)
					.innerJoin(
						environments,
						eq(applications.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(applications.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(applications)
					.innerJoin(
						environments,
						eq(applications.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where),
			]);

			return {
				items,
				total: countResult[0]?.count ?? 0,
			};
		}),

	readLogs: protectedProcedure
		.meta({
			openapi: {
				summary: "Read application logs",
				description: "Retrieves Docker container logs for the application with configurable tail length, time range, and optional text search filtering.",
			},
		})
		.input(
			apiFindOneApplication.extend({
				tail: z.number().int().min(1).max(10000).default(100),
				since: z
					.string()
					.regex(/^(all|\d+[smhd])$/, "Invalid since format")
					.default("all"),
				search: z
					.string()
					.regex(/^[a-zA-Z0-9 ._-]{0,500}$/)
					.optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.applicationId, "read");
			const application = await findApplicationById(input.applicationId);
			if (
				application.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await getContainerLogs(
				application.appName,
				input.tail,
				input.since,
				input.search,
				application.serverId,
			);
		}),
});
