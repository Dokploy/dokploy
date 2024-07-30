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
	apiSaveBuildType,
	apiSaveDockerProvider,
	apiSaveEnvironmentVariables,
	apiSaveGitProvider,
	apiSaveGithubProvider,
	apiUpdateApplication,
	applications,
} from "@/server/db/schema/application";
import {
	type DeploymentJob,
	cleanQueuesByApplication,
} from "@/server/queues/deployments-queue";
import { myQueue } from "@/server/queues/queueSetup";
import {
	removeService,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import {
	removeDirectoryCode,
	removeMonitoringDirectory,
} from "@/server/utils/filesystem/directory";
import {
	readConfig,
	removeTraefikConfig,
	writeConfig,
} from "@/server/utils/traefik/application";
import { deleteAllMiddlewares } from "@/server/utils/traefik/middleware";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	createApplication,
	findApplicationById,
	getApplicationStats,
	updateApplication,
	updateApplicationStatus,
} from "../services/application";
import { removeDeployments } from "../services/deployment";
import { addNewService, checkServiceAccess } from "../services/user";

import { unzipDrop } from "@/server/utils/builders/drop";
import { uploadFileSchema } from "@/utils/schema";

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
			await stopService(input.appName);
			await updateApplicationStatus(input.applicationId, "idle");
			await startService(input.appName);
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
				async () => deleteAllMiddlewares(application),
				async () => await removeDeployments(application),
				async () => await removeDirectoryCode(application?.appName),
				async () => await removeMonitoringDirectory(application?.appName),
				async () => await removeTraefikConfig(application?.appName),
				async () => await removeService(application?.appName),
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
			await stopService(service.appName);
			await updateApplicationStatus(input.applicationId, "idle");

			return service;
		}),

	start: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input }) => {
			const service = await findApplicationById(input.applicationId);

			await startService(service.appName);
			await updateApplicationStatus(input.applicationId, "done");

			return service;
		}),

	redeploy: protectedProcedure
		.input(apiFindOneApplication)
		.mutation(async ({ input }) => {
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Rebuild deployment",
				descriptionLog: "",
				type: "redeploy",
				applicationType: "application",
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
		.mutation(async ({ input }) => {
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
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

			const traefikConfig = readConfig(application.appName);
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
			await unzipDrop(zipFile, app.appName);

			const jobData: DeploymentJob = {
				applicationId: app.applicationId,
				titleLog: "Manual deployment",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
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
			writeConfig(application.appName, input.traefikConfig);
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
