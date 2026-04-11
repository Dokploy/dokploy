import {
	addDomainToCompose,
	clearOldDeployments,
	cloneCompose,
	createCommand,
	createCompose,
	createComposeByTemplate,
	createDomain,
	createMount,
	deleteMount,
	execAsync,
	execAsyncRemote,
	findComposeById,
	findDomainsByComposeId,
	findEnvironmentById,
	findGitProviderById,
	findProjectById,
	findServerById,
	getAccessibleServerIds,
	getComposeContainer,
	getContainerLogs,
	getWebServerSettings,
	IS_CLOUD,
	loadServices,
	randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile,
	removeCompose,
	removeComposeDirectory,
	removeDeploymentsByComposeId,
	removeDomainById,
	startCompose,
	stopCompose,
	updateCompose,
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import {
	type CompleteTemplate,
	fetchTemplateFiles,
	fetchTemplatesList,
} from "@dokploy/server/templates/github";
import { processTemplate } from "@dokploy/server/templates/processors";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import _ from "lodash";
import { nanoid } from "nanoid";
import { parse } from "toml";
import { stringify } from "yaml";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import {
	apiCreateCompose,
	apiDeleteCompose,
	apiDeployCompose,
	apiFetchServices,
	apiFindCompose,
	apiRandomizeCompose,
	apiRedeployCompose,
	apiSaveEnvironmentVariablesCompose,
	apiUpdateCompose,
	compose as composeTable,
	environments,
	projects,
} from "@/server/db/schema";
import { deploymentWorker } from "@/server/queues/deployments-queue";
import type { DeploymentJob } from "@/server/queues/queue-types";
import {
	cleanQueuesByCompose,
	getJobsByComposeId,
	killDockerBuild,
	myQueue,
} from "@/server/queues/queueSetup";
import { cancelDeployment, deploy } from "@/server/utils/deploy";
import { generatePassword } from "@/templates/utils";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { audit } from "../utils/audit";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.meta({
			openapi: {
				summary: "Create a compose service",
				description: "Creates a new Docker Compose service in the specified project environment with the given configuration.",
			},
		})
		.input(apiCreateCompose)
		.mutation(async ({ ctx, input }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You need to use a server to create a compose",
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

				const newService = await createCompose({
					...input,
				});

				await addNewService(ctx, newService.composeId);

				await audit(ctx, {
					action: "create",
					resourceType: "service",
					resourceId: newService.composeId,
					resourceName: newService.appName,
				});
				return newService;
			} catch (error) {
				throw error;
			}
		}),

	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a compose service",
				description: "Retrieves detailed information about a compose service by its ID, including git provider access status and deployment configuration.",
			},
		})
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.composeId, "read");

			const compose = await findComposeById(input.composeId);
			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}

			let hasGitProviderAccess = true;
			let unauthorizedProvider: string | null = null;

			const getGitProviderId = () => {
				switch (compose.sourceType) {
					case "github":
						return compose.github?.gitProviderId;
					case "gitlab":
						return compose.gitlab?.gitProviderId;
					case "bitbucket":
						return compose.bitbucket?.gitProviderId;
					case "gitea":
						return compose.gitea?.gitProviderId;
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
						unauthorizedProvider = compose.sourceType;
					}
				} catch {
					hasGitProviderAccess = false;
					unauthorizedProvider = compose.sourceType;
				}
			}

			return {
				...compose,
				hasGitProviderAccess,
				unauthorizedProvider,
			};
		}),

	update: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a compose service",
				description: "Updates the configuration of a compose service such as name, description, compose file content, and other settings.",
			},
		})
		.input(apiUpdateCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const updated = await updateCompose(input.composeId, input);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: updated?.name,
			});
			return updated;
		}),
	saveEnvironment: protectedProcedure
		.meta({
			openapi: {
				summary: "Save compose environment variables",
				description: "Updates the environment variables for a compose service.",
			},
		})
		.input(apiSaveEnvironmentVariablesCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				envVars: ["write"],
			});
			const updated = await updateCompose(input.composeId, {
				env: input.env,
			});

			if (!updated) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error adding environment variables",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: updated?.name,
			});
			return true;
		}),
	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a compose service",
				description: "Permanently deletes a compose service and cleans up associated Docker resources, deployments, and directories. Optionally deletes associated volumes.",
			},
		})
		.input(apiDeleteCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServiceAccess(ctx, input.composeId, "delete");
			const composeResult = await findComposeById(input.composeId);

			if (
				composeResult.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this compose",
				});
			}

			const result = await db
				.delete(composeTable)
				.where(eq(composeTable.composeId, input.composeId))
				.returning();

			if (!IS_CLOUD) {
				const queueJobs = await getJobsByComposeId(input.composeId);
				for (const job of queueJobs) {
					if (job.id) {
						deploymentWorker.cancelJob(job.id, "User requested cancellation");
					}
				}
			}

			const cleanupOperations = [
				async () => await removeCompose(composeResult, input.deleteVolumes),
				async () => await removeDeploymentsByComposeId(composeResult),
				async () => await removeComposeDirectory(composeResult.appName),
			];

			for (const operation of cleanupOperations) {
				try {
					await operation();
				} catch (_) {}
			}

			await audit(ctx, {
				action: "delete",
				resourceType: "service",
				resourceId: composeResult.composeId,
				resourceName: composeResult.appName,
			});
			return composeResult;
		}),
	cleanQueues: protectedProcedure
		.meta({
			openapi: {
				summary: "Clean deployment queues",
				description: "Removes all pending deployment jobs from the queue for the specified compose service.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			await cleanQueuesByCompose(input.composeId);
			return { success: true, message: "Queues cleaned successfully" };
		}),
	clearDeployments: protectedProcedure
		.meta({
			openapi: {
				summary: "Clear old deployments",
				description: "Removes old deployment logs and artifacts for the compose service to free up disk space.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			await clearOldDeployments(compose.appName, compose.serverId);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return true;
		}),
	killBuild: protectedProcedure
		.meta({
			openapi: {
				summary: "Kill active build",
				description: "Forcefully terminates the currently running Docker build process for the compose service.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["cancel"],
			});
			const compose = await findComposeById(input.composeId);
			await killDockerBuild("compose", compose.serverId);
		}),

	loadServices: protectedProcedure
		.meta({
			openapi: {
				summary: "Load compose services",
				description: "Parses the compose file and returns the list of services defined in it, with their current container status.",
			},
		})
		.input(apiFetchServices)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			return await loadServices(input.composeId, input.type);
		}),
	loadMountsByService: protectedProcedure
		.meta({
			openapi: {
				summary: "Load mounts by service",
				description: "Retrieves the Docker volume mounts for a specific service within a compose stack by inspecting the running container.",
			},
		})
		.input(
			z.object({
				composeId: z.string().min(1),
				serviceName: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			const container = await getComposeContainer(compose, input.serviceName);
			const mounts = container?.Mounts.filter(
				(mount) => mount.Type === "volume" && mount.Source !== "",
			);
			return mounts;
		}),
	fetchSourceType: protectedProcedure
		.meta({
			openapi: {
				summary: "Fetch and clone source",
				description: "Clones the compose repository from the configured git provider and returns the source type. Executes the clone command locally or on a remote server.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkServicePermissionAndAccess(ctx, input.composeId, {
					service: ["create"],
				});
				const compose = await findComposeById(input.composeId);

				const command = await cloneCompose(compose);
				if (compose.serverId) {
					await execAsyncRemote(compose.serverId, command);
				} else {
					await execAsync(command);
				}
				return compose.sourceType;
			} catch (err) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error fetching source type",
					cause: err,
				});
			}
		}),

	randomizeCompose: protectedProcedure
		.meta({
			openapi: {
				summary: "Randomize compose file",
				description: "Adds a random suffix to service names and volumes in the compose file to avoid naming conflicts between deployments.",
			},
		})
		.input(apiRandomizeCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const result = await randomizeComposeFile(input.composeId, input.suffix);
			const compose = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return result;
		}),
	isolatedDeployment: protectedProcedure
		.meta({
			openapi: {
				summary: "Randomize for isolated deployment",
				description: "Randomizes the compose file for isolated deployment mode, ensuring unique service and volume names to support parallel deployments.",
			},
		})
		.input(apiRandomizeCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const result = await randomizeIsolatedDeploymentComposeFile(
				input.composeId,
				input.suffix,
			);
			const compose = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return result;
		}),
	getConvertedCompose: protectedProcedure
		.meta({
			openapi: {
				summary: "Get converted compose file",
				description: "Returns the compose file with domains injected as Traefik labels, converted to YAML format ready for deployment.",
			},
		})
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			const domains = await findDomainsByComposeId(input.composeId);
			const composeFile = await addDomainToCompose(compose, domains);
			return stringify(composeFile, {
				lineWidth: 1000,
			});
		}),

	deploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy a compose service",
				description: "Triggers a new deployment for the compose service. Queues a deployment job or executes it directly for cloud servers.",
			},
		})
		.input(apiDeployCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			const compose = await findComposeById(input.composeId);

			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: input.title || "Manual deployment",
				type: "deploy",
				applicationType: "compose",
				descriptionLog: input.description || "",
				server: !!compose.serverId,
			};

			if (IS_CLOUD && compose.serverId) {
				jobData.serverId = compose.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				await audit(ctx, {
					action: "deploy",
					resourceType: "compose",
					resourceId: input.composeId,
					resourceName: compose.name,
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
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return {
				success: true,
				message: "Deployment queued",
				composeId: compose.composeId,
			};
		}),
	redeploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Redeploy a compose service",
				description: "Triggers a rebuild and redeployment of the compose service. Queues a deployment job or executes it directly for cloud servers.",
			},
		})
		.input(apiRedeployCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			const jobData: DeploymentJob = {
				composeId: input.composeId,
				titleLog: input.title || "Rebuild deployment",
				type: "redeploy",
				applicationType: "compose",
				descriptionLog: input.description || "",
				server: !!compose.serverId,
			};
			if (IS_CLOUD && compose.serverId) {
				jobData.serverId = compose.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				await audit(ctx, {
					action: "deploy",
					resourceType: "compose",
					resourceId: input.composeId,
					resourceName: compose.name,
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
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return {
				success: true,
				message: "Redeployment queued",
				composeId: compose.composeId,
			};
		}),
	stop: protectedProcedure
		.meta({
			openapi: {
				summary: "Stop a compose service",
				description: "Stops all running containers for the compose service using docker compose stop.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			await stopCompose(input.composeId);
			const composeForStop = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "stop",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: composeForStop.name,
			});
			return true;
		}),
	start: protectedProcedure
		.meta({
			openapi: {
				summary: "Start a compose service",
				description: "Starts all containers for the compose service using docker compose start.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			await startCompose(input.composeId);
			const composeForStart = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "start",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: composeForStart.name,
			});
			return true;
		}),
	getDefaultCommand: protectedProcedure
		.meta({
			openapi: {
				summary: "Get default compose command",
				description: "Generates and returns the default docker compose command that would be used to deploy the service.",
			},
		})
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			const command = createCommand(compose);
			return `docker ${command}`;
		}),
	refreshToken: protectedProcedure
		.meta({
			openapi: {
				summary: "Refresh deploy token",
				description: "Regenerates the webhook refresh token for the compose service, invalidating the previous token used for triggering deployments.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			await updateCompose(input.composeId, {
				refreshToken: nanoid(),
			});
			const composeForToken = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: composeForToken.name,
			});
			return true;
		}),
	deployTemplate: protectedProcedure
		.meta({
			openapi: {
				summary: "Deploy a template",
				description: "Creates a new compose service from a template by fetching its files, processing variables, creating mounts and domains, and setting up the compose configuration.",
			},
		})
		.input(
			z.object({
				environmentId: z.string(),
				serverId: z.string().optional(),
				id: z.string(),
				baseUrl: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const environment = await findEnvironmentById(input.environmentId);

			await checkServiceAccess(ctx, environment.projectId, "create");

			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a compose",
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

			const template = await fetchTemplateFiles(input.id, input.baseUrl);

			let serverIp = "127.0.0.1";

			const project = await findProjectById(environment.projectId);

			if (input.serverId) {
				const server = await findServerById(input.serverId);
				serverIp = server.ipAddress;
			} else if (process.env.NODE_ENV === "development") {
				serverIp = "127.0.0.1";
			} else {
				const settings = await getWebServerSettings();
				serverIp = settings?.serverIp || "127.0.0.1";
			}

			const projectName = slugify(`${project.name} ${input.id}`);
			const appName = `${projectName}-${generatePassword(6)}`;
			const config = {
				...template.config,
				variables: {
					APP_NAME: appName,
					...template.config.variables,
				},
			};
			const generate = processTemplate(config, {
				serverIp: serverIp,
				projectName: projectName,
			});

			const compose = await createComposeByTemplate({
				...input,
				composeFile: template.dockerCompose,
				env: generate.envs?.join("\n"),
				serverId: input.serverId,
				name: input.id,
				sourceType: "raw",
				appName: appName,
				isolatedDeployment: true,
			});

			await addNewService(ctx, compose.composeId);

			if (generate.mounts && generate.mounts?.length > 0) {
				for (const mount of generate.mounts) {
					await createMount({
						filePath: mount.filePath,
						mountPath: "",
						content: mount.content,
						serviceId: compose.composeId,
						serviceType: "compose",
						type: "file",
					});
				}
			}

			if (generate.domains && generate.domains?.length > 0) {
				for (const domain of generate.domains) {
					await createDomain({
						...domain,
						domainType: "compose",
						certificateType: "none",
						composeId: compose.composeId,
						host: domain.host || "",
					});
				}
			}

			await audit(ctx, {
				action: "create",
				resourceType: "compose",
				resourceId: compose.composeId,
				resourceName: compose.name,
			});
			return compose;
		}),

	templates: protectedProcedure
		.meta({
			openapi: {
				summary: "List available templates",
				description: "Fetches the list of available compose templates from the GitHub templates repository.",
			},
		})
		.input(z.object({ baseUrl: z.string().optional() }))
		.query(async ({ input }) => {
			try {
				const githubTemplates = await fetchTemplatesList(input.baseUrl);

				if (githubTemplates.length > 0) {
					return githubTemplates;
				}
			} catch (error) {
				console.warn(
					"Failed to fetch templates from GitHub, falling back to local templates:",
					error,
				);
			}
			return [];
		}),

	getTags: protectedProcedure
		.meta({
			openapi: {
				summary: "Get template tags",
				description: "Fetches all unique tags from the available compose templates for filtering purposes.",
			},
		})
		.input(z.object({ baseUrl: z.string().optional() }))
		.query(async ({ input }) => {
			const githubTemplates = await fetchTemplatesList(input.baseUrl);

			const allTags = githubTemplates.flatMap((template) => template.tags);
			const uniqueTags = _.uniq(allTags);
			return uniqueTags;
		}),
	disconnectGitProvider: protectedProcedure
		.meta({
			openapi: {
				summary: "Disconnect git provider",
				description: "Removes all git provider configuration from the compose service, resetting source type to default and clearing repository, branch, and owner fields for all providers.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});

			await updateCompose(input.composeId, {
				repository: null,
				branch: null,
				owner: null,
				composePath: undefined,
				githubId: null,
				triggerType: "push",

				gitlabRepository: null,
				gitlabOwner: null,
				gitlabBranch: null,
				gitlabId: null,
				gitlabProjectId: null,
				gitlabPathNamespace: null,

				bitbucketRepository: null,
				bitbucketOwner: null,
				bitbucketBranch: null,
				bitbucketId: null,

				giteaRepository: null,
				giteaOwner: null,
				giteaBranch: null,
				giteaId: null,

				customGitBranch: null,
				customGitUrl: null,
				customGitSSHKeyId: null,

				sourceType: "github", // Reset to default
				composeStatus: "idle",
				watchPaths: null,
				enableSubmodules: false,
			});

			const composeForDisconnect = await findComposeById(input.composeId);
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: composeForDisconnect.name,
			});
			return true;
		}),

	move: protectedProcedure
		.meta({
			openapi: {
				summary: "Move compose to another environment",
				description: "Moves a compose service to a different environment within the same project or to another project's environment.",
			},
		})
		.input(
			z.object({
				composeId: z.string(),
				targetEnvironmentId: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});

			const updatedCompose = await db
				.update(composeTable)
				.set({
					environmentId: input.targetEnvironmentId,
				})
				.where(eq(composeTable.composeId, input.composeId))
				.returning()
				.then((res) => res[0]);

			if (!updatedCompose) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to move compose",
				});
			}

			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: updatedCompose.name,
			});
			return updatedCompose;
		}),

	processTemplate: protectedProcedure
		.meta({
			openapi: {
				summary: "Process a template",
				description: "Processes a base64-encoded template configuration, resolving variables and generating the compose file and environment settings without applying them.",
			},
		})
		.input(
			z.object({
				base64: z.string(),
				composeId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkServicePermissionAndAccess(ctx, input.composeId, {
					service: ["create"],
				});
				const compose = await findComposeById(input.composeId);

				const decodedData = Buffer.from(input.base64, "base64").toString(
					"utf-8",
				);
				let serverIp = "127.0.0.1";

				if (compose.serverId) {
					const server = await findServerById(compose.serverId);
					serverIp = server.ipAddress;
				} else if (process.env.NODE_ENV === "development") {
					serverIp = "127.0.0.1";
				} else {
					const settings = await getWebServerSettings();
					serverIp = settings?.serverIp || "127.0.0.1";
				}
				const templateData = JSON.parse(decodedData);
				const config = parse(templateData.config) as CompleteTemplate;

				if (!templateData.compose || !config) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Invalid template format. Must contain compose and config fields",
					});
				}

				const configModified = {
					...config,
					variables: {
						APP_NAME: compose.appName,
						...config.variables,
					},
				};

				const processedTemplate = processTemplate(configModified, {
					serverIp: serverIp,
					projectName: compose.appName,
				});

				return {
					compose: templateData.compose,
					template: processedTemplate,
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error processing template: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	import: protectedProcedure
		.meta({
			openapi: {
				summary: "Import a template",
				description: "Imports a base64-encoded template into an existing compose service, replacing its compose file, environment variables, mounts, and domains with the template's configuration.",
			},
		})
		.input(
			z.object({
				base64: z.string(),
				composeId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				await checkServicePermissionAndAccess(ctx, input.composeId, {
					service: ["create"],
				});
				const compose = await findComposeById(input.composeId);
				const decodedData = Buffer.from(input.base64, "base64").toString(
					"utf-8",
				);

				for (const mount of compose.mounts) {
					await deleteMount(mount.mountId);
				}

				for (const domain of compose.domains) {
					await removeDomainById(domain.domainId);
				}

				let serverIp = "127.0.0.1";

				if (compose.serverId) {
					const server = await findServerById(compose.serverId);
					serverIp = server.ipAddress;
				} else if (process.env.NODE_ENV === "development") {
					serverIp = "127.0.0.1";
				} else {
					const settings = await getWebServerSettings();
					serverIp = settings?.serverIp || "127.0.0.1";
				}

				const templateData = JSON.parse(decodedData);

				const config = parse(templateData.config) as CompleteTemplate;

				if (!templateData.compose || !config) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Invalid template format. Must contain compose and config fields",
					});
				}

				const configModified = {
					...config,
					variables: {
						APP_NAME: compose.appName,
						...config.variables,
					},
				};

				const processedTemplate = processTemplate(configModified, {
					serverIp: serverIp,
					projectName: compose.appName,
				});

				await updateCompose(input.composeId, {
					composeFile: templateData.compose,
					sourceType: "raw",
					env: processedTemplate.envs?.join("\n"),
					isolatedDeployment: true,
				});

				if (processedTemplate.mounts && processedTemplate.mounts.length > 0) {
					for (const mount of processedTemplate.mounts) {
						await createMount({
							filePath: mount.filePath,
							mountPath: "",
							content: mount.content,
							serviceId: compose.composeId,
							serviceType: "compose",
							type: "file",
						});
					}
				}

				if (processedTemplate.domains && processedTemplate.domains.length > 0) {
					for (const domain of processedTemplate.domains) {
						await createDomain({
							...domain,
							domainType: "compose",
							certificateType: "none",
							composeId: compose.composeId,
							host: domain.host || "",
						});
					}
				}

				await audit(ctx, {
					action: "update",
					resourceType: "compose",
					resourceId: input.composeId,
					resourceName: compose.appName,
				});
				return {
					success: true,
					message: "Template imported successfully",
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error importing template: ${error instanceof Error ? error.message : error}`,
				});
			}
		}),

	cancelDeployment: protectedProcedure
		.meta({
			openapi: {
				summary: "Cancel a deployment",
				description: "Cancels an in-progress deployment for the compose service and resets its status to idle. Only available in cloud version.",
			},
		})
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["cancel"],
			});
			const compose = await findComposeById(input.composeId);

			if (IS_CLOUD && compose.serverId) {
				try {
					await updateCompose(input.composeId, {
						composeStatus: "idle",
					});

					if (compose.deployments[0]) {
						await updateDeploymentStatus(
							compose.deployments[0].deploymentId,
							"done",
						);
					}

					await cancelDeployment({
						composeId: input.composeId,
						applicationType: "compose",
					});

					await audit(ctx, {
						action: "stop",
						resourceType: "compose",
						resourceId: input.composeId,
						resourceName: compose.name,
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
				summary: "Search compose services",
				description: "Searches compose services by name, appName, or description with pagination. Respects service-level access control.",
			},
		})
		.input(
			z.object({
				q: z.string().optional(),
				name: z.string().optional(),
				appName: z.string().optional(),
				description: z.string().optional(),
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
					eq(composeTable.environmentId, input.environmentId),
				);
			}

			if (input.q?.trim()) {
				const term = `%${input.q.trim()}%`;
				baseConditions.push(
					or(
						ilike(composeTable.name, term),
						ilike(composeTable.appName, term),
						ilike(composeTable.description ?? "", term),
					)!,
				);
			}

			if (input.name?.trim()) {
				baseConditions.push(ilike(composeTable.name, `%${input.name.trim()}%`));
			}
			if (input.appName?.trim()) {
				baseConditions.push(
					ilike(composeTable.appName, `%${input.appName.trim()}%`),
				);
			}
			if (input.description?.trim()) {
				baseConditions.push(
					ilike(
						composeTable.description ?? "",
						`%${input.description.trim()}%`,
					),
				);
			}

			const { accessedServices } = await findMemberByUserId(
				ctx.user.id,
				ctx.session.activeOrganizationId,
			);
			if (accessedServices.length === 0) return { items: [], total: 0 };
			baseConditions.push(
				sql`${composeTable.composeId} IN (${sql.join(
					accessedServices.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);

			const where = and(...baseConditions);

			const [items, countResult] = await Promise.all([
				db
					.select({
						composeId: composeTable.composeId,
						name: composeTable.name,
						appName: composeTable.appName,
						description: composeTable.description,
						environmentId: composeTable.environmentId,
						composeStatus: composeTable.composeStatus,
						sourceType: composeTable.sourceType,
						createdAt: composeTable.createdAt,
					})
					.from(composeTable)
					.innerJoin(
						environments,
						eq(composeTable.environmentId, environments.environmentId),
					)
					.innerJoin(projects, eq(environments.projectId, projects.projectId))
					.where(where)
					.orderBy(desc(composeTable.createdAt))
					.limit(input.limit)
					.offset(input.offset),
				db
					.select({ count: sql<number>`count(*)::int` })
					.from(composeTable)
					.innerJoin(
						environments,
						eq(composeTable.environmentId, environments.environmentId),
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
				summary: "Read compose container logs",
				description: "Retrieves Docker container logs for a specific container within the compose service with configurable tail length, time range, and optional text search filtering.",
			},
		})
		.input(
			apiFindCompose.extend({
				containerId: z
					.string()
					.min(1)
					.regex(/^[a-zA-Z0-9.\-_]+$/, "Invalid container id."),
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
			await checkServiceAccess(ctx, input.composeId, "read");
			const compose = await findComposeById(input.composeId);
			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this compose",
				});
			}
			return await getContainerLogs(
				input.containerId,
				input.tail,
				input.since,
				input.search,
				compose.serverId,
				true,
			);
		}),
});
