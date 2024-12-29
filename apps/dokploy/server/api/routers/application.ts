import {
	createTRPCRouter,
	protectedProcedure,
	uploadProcedure,
} from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateApplication,
	apiFindMonitoringStats,
	apiFindOneApplication,
	apiReloadApplication,
	apiSaveBitbucketProvider,
	apiSaveBuildType,
	apiSaveDockerProvider,
	apiSaveEnvironmentVariables,
	apiSaveGitProvider,
	apiSaveGithubProvider,
	apiSaveGitlabProvider,
	apiUpdateApplication,
	applications,
} from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { cleanQueuesByApplication, myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { uploadFileSchema } from "@/utils/schema";
import {
	IS_CLOUD,
	addNewService,
	checkServiceAccess,
	createApplication,
	deleteAllMiddlewares,
	findApplicationById,
	findProjectById,
	getApplicationStats,
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
	writeConfig,
	writeConfigRemote,
	// uploadFileSchema
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

export const applicationRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateApplication)
		.mutation(async ({ input, ctx }) => {
			try {
				if (ctx.user.rol === "user") {
					await checkServiceAccess(ctx.user.authId, input.projectId, "create");
				}

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create an application",
					});
				}

				const project = await findProjectById(input.projectId);
				if (project.adminId !== ctx.user.adminId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this project",
					});
				}
				const newApplication = await createApplication(input);

				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newApplication.applicationId);
				}
				return newApplication;
			} catch (error: unknown) {
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
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(
					ctx.user.authId,
					input.applicationId,
					"access",
				);
			}
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return application;
		}),

	reload: protectedProcedure
		.input(apiReloadApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to reload this application",
				});
			}
			if (application.serverId) {
				await stopServiceRemote(application.serverId, input.appName);
			} else {
				await stopService(input.appName);
			}
			await updateApplicationStatus(input.applicationId, "idle");

			if (application.serverId) {
				await startServiceRemote(application.serverId, input.appName);
			} else {
				await startService(input.appName);
			}
			await updateApplicationStatus(input.applicationId, "done");
			return true;
		}),

	delete: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.rol === "user") {
				await checkServiceAccess(
					ctx.user.authId,
					input.applicationId,
					"delete",
				);
			}
			const application = await findApplicationById(input.applicationId);

			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this application",
				});
			}

			const result = await db
				.delete(applications)
				.where(eq(applications.applicationId, input.applicationId))
				.returning();

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
				} catch (error) {}
			}

			return result[0];
		}),

	stop: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const service = await findApplicationById(input.applicationId);
			if (service.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to stop this application",
				});
			}
			if (service.serverId) {
				await stopServiceRemote(service.serverId, service.appName);
			} else {
				await stopService(service.appName);
			}
			await updateApplicationStatus(input.applicationId, "idle");

			return service;
		}),

	start: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const service = await findApplicationById(input.applicationId);
			if (service.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to start this application",
				});
			}

			if (service.serverId) {
				await startServiceRemote(service.serverId, service.appName);
			} else {
				await startService(service.appName);
			}
			await updateApplicationStatus(input.applicationId, "done");

			return service;
		}),

	redeploy: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to redeploy this application",
				});
			}
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Rebuild deployment",
				descriptionLog: "",
				type: "redeploy",
				applicationType: "application",
				server: !!application.serverId,
			};

			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				await deploy(jobData);
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
		}),
	saveEnvironment: protectedProcedure
		.input(apiSaveEnvironmentVariables)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this environment",
				});
			}
			await updateApplication(input.applicationId, {
				env: input.env,
				buildArgs: input.buildArgs,
			});
			return true;
		}),
	saveBuildType: protectedProcedure
		.input(apiSaveBuildType)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this build type",
				});
			}
			await updateApplication(input.applicationId, {
				buildType: input.buildType,
				dockerfile: input.dockerfile,
				publishDirectory: input.publishDirectory,
				dockerContextPath: input.dockerContextPath,
				dockerBuildStage: input.dockerBuildStage,
				herokuVersion: input.herokuVersion,
			});

			return true;
		}),
	saveGithubProvider: protectedProcedure
		.input(apiSaveGithubProvider)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this github provider",
				});
			}
			await updateApplication(input.applicationId, {
				repository: input.repository,
				branch: input.branch,
				sourceType: "github",
				owner: input.owner,
				buildPath: input.buildPath,
				applicationStatus: "idle",
				githubId: input.githubId,
			});

			return true;
		}),
	saveGitlabProvider: protectedProcedure
		.input(apiSaveGitlabProvider)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this gitlab provider",
				});
			}
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
			});

			return true;
		}),
	saveBitbucketProvider: protectedProcedure
		.input(apiSaveBitbucketProvider)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this bitbucket provider",
				});
			}
			await updateApplication(input.applicationId, {
				bitbucketRepository: input.bitbucketRepository,
				bitbucketOwner: input.bitbucketOwner,
				bitbucketBranch: input.bitbucketBranch,
				bitbucketBuildPath: input.bitbucketBuildPath,
				sourceType: "bitbucket",
				applicationStatus: "idle",
				bitbucketId: input.bitbucketId,
			});

			return true;
		}),
	saveDockerProvider: protectedProcedure
		.input(apiSaveDockerProvider)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this docker provider",
				});
			}
			await updateApplication(input.applicationId, {
				dockerImage: input.dockerImage,
				username: input.username,
				password: input.password,
				sourceType: "docker",
				applicationStatus: "idle",
				registryUrl: input.registryUrl,
			});

			return true;
		}),
	saveGitProdiver: protectedProcedure
		.input(apiSaveGitProvider)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to save this git provider",
				});
			}
			await updateApplication(input.applicationId, {
				customGitBranch: input.customGitBranch,
				customGitBuildPath: input.customGitBuildPath,
				customGitUrl: input.customGitUrl,
				customGitSSHKeyId: input.customGitSSHKeyId,
				sourceType: "git",
				applicationStatus: "idle",
			});

			return true;
		}),
	markRunning: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to mark this application as running",
				});
			}
			await updateApplicationStatus(input.applicationId, "running");
		}),
	update: protectedProcedure
		.input(apiUpdateApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this application",
				});
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

			return true;
		}),
	refreshToken: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to refresh this application",
				});
			}
			await updateApplication(input.applicationId, {
				refreshToken: nanoid(),
			});
			return true;
		}),
	deploy: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this application",
				});
			}
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: !!application.serverId,
			};
			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				await deploy(jobData);

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
		}),

	cleanQueues: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to clean this application",
				});
			}
			await cleanQueuesByApplication(input.applicationId);
		}),

	readTraefikConfig: protectedProcedure
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to read this application",
				});
			}

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
				path: "/drop-deployment",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.use(uploadProcedure)
		.input(uploadFileSchema)
		.mutation(async ({ input, ctx }) => {
			const zipFile = input.zip;

			const app = await findApplicationById(input.applicationId as string);

			if (app.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to deploy this application",
				});
			}

			await updateApplication(input.applicationId as string, {
				sourceType: "drop",
				dropBuildPath: input.dropBuildPath || "",
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
				await deploy(jobData);
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
			return true;
		}),
	updateTraefikConfig: protectedProcedure
		.input(z.object({ applicationId: z.string(), traefikConfig: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);

			if (application.project.adminId !== ctx.user.adminId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this application",
				});
			}

			if (application.serverId) {
				await writeConfigRemote(
					application.serverId,
					application.appName,
					input.traefikConfig,
				);
			} else {
				writeConfig(application.appName, input.traefikConfig);
			}
			return true;
		}),
	readAppMonitoring: protectedProcedure
		.input(apiFindMonitoringStats)
		.query(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Functionality not available in cloud version",
				});
			}
			const stats = await getApplicationStats(input.appName);

			return stats;
		}),
});
