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
import {
	type DeploymentJob,
	cleanQueuesByApplication,
} from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";
import {
	unzipDrop,
	removeService,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	removeDirectoryCode,
	removeMonitoringDirectory,
	readConfig,
	readRemoteConfig,
	removeTraefikConfig,
	writeConfig,
	writeConfigRemote,
	deleteAllMiddlewares,
	createApplication,
	findApplicationById,
	getApplicationStats,
	updateApplication,
	updateApplicationStatus,
	removeDeployments,
	addNewService,
	checkServiceAccess,
	// uploadFileSchema
} from "@dokploy/builders";
import { uploadFileSchema } from "@/utils/schema";
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
				const newApplication = await createApplication(input);

				if (ctx.user.rol === "user") {
					await addNewService(ctx.user.authId, newApplication.applicationId);
				}
			} catch (error: unknown) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the application",
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
			return await findApplicationById(input.applicationId);
		}),

	reload: protectedProcedure
		.input(apiReloadApplication)
		.mutation(async ({ input }) => {
			const application = await findApplicationById(input.applicationId);
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
		.mutation(async ({ input }) => {
			const service = await findApplicationById(input.applicationId);
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
		.mutation(async ({ input }) => {
			const service = await findApplicationById(input.applicationId);
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
		.mutation(async ({ input }) => {
			const application = await findApplicationById(input.applicationId);
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Rebuild deployment",
				descriptionLog: "",
				type: "redeploy",
				applicationType: "application",
				server: !!application.serverId,
			};
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
		.mutation(async ({ input }) => {
			await updateApplication(input.applicationId, {
				env: input.env,
				buildArgs: input.buildArgs,
			});
			return true;
		}),
	saveBuildType: protectedProcedure
		.input(apiSaveBuildType)
		.mutation(async ({ input }) => {
			await updateApplication(input.applicationId, {
				buildType: input.buildType,
				dockerfile: input.dockerfile,
				publishDirectory: input.publishDirectory,
				dockerContextPath: input.dockerContextPath,
				dockerBuildStage: input.dockerBuildStage,
			});

			return true;
		}),
	saveGithubProvider: protectedProcedure
		.input(apiSaveGithubProvider)
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
			await updateApplication(input.applicationId, {
				dockerImage: input.dockerImage,
				username: input.username,
				password: input.password,
				sourceType: "docker",
				applicationStatus: "idle",
			});

			return true;
		}),
	saveGitProdiver: protectedProcedure
		.input(apiSaveGitProvider)
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
			await updateApplicationStatus(input.applicationId, "running");
		}),
	update: protectedProcedure
		.input(apiUpdateApplication)
		.mutation(async ({ input }) => {
			const { applicationId, ...rest } = input;
			const application = await updateApplication(applicationId, {
				...rest,
			});

			if (!application) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Update: Error to update application",
				});
			}

			return true;
		}),
	refreshToken: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input }) => {
			await updateApplication(input.applicationId, {
				refreshToken: nanoid(),
			});
			return true;
		}),
	deploy: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: !!application.serverId,
			};
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
		.mutation(async ({ input }) => {
			await cleanQueuesByApplication(input.applicationId);
		}),

	readTraefikConfig: protectedProcedure
		.input(apiFindOneApplication)
		.query(async ({ input }) => {
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
				path: "/drop-deployment",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.use(uploadProcedure)
		.input(uploadFileSchema)
		.mutation(async ({ input }) => {
			const zipFile = input.zip;

			updateApplication(input.applicationId as string, {
				sourceType: "drop",
				dropBuildPath: input.dropBuildPath,
			});

			const app = await findApplicationById(input.applicationId as string);
			await unzipDrop(zipFile, app);

			const jobData: DeploymentJob = {
				applicationId: app.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: !!app.serverId,
			};
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
		.mutation(async ({ input }) => {
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
			return true;
		}),
	readAppMonitoring: protectedProcedure
		.input(apiFindMonitoringStats)
		.query(async ({ input }) => {
			const stats = await getApplicationStats(input.appName);

			return stats;
		}),
});

// Paketo Buildpacks:     paketobuildpacks/builder-jammy-full                     Ubuntu 22.04 Jammy Jellyfish full image with buildpacks for Apache HTTPD, Go, Java, Java Native Image, .NET, NGINX, Node.js, PHP, Procfile, Python, and Ruby
// Heroku:                heroku/builder:22                                       Heroku-22 (Ubuntu 22.04) base image with buildpacks for Go, Java, Node.js, PHP, Python, Ruby & Scala.
// pack build imageName --path ./ --builder paketobuildpacks/builder-jammy-full
// pack build prueba-pack --path ./ --builder heroku/builder:22
