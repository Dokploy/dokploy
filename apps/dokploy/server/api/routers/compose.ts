import { dirname, join } from "node:path";
import {
	addDomainToCompose,
	assertComposeBuildSettings,
	// build-policy hook: required-checks support check at the API boundary.
	assertRequiredChecksSupportedForUpdate,
	clearOldDeployments,
	cloneBitbucketRepository,
	cloneCompose,
	cloneGiteaRepository,
	cloneGithubRepository,
	cloneGitlabRepository,
	cloneGitRepository,
	createCommand,
	createCompose,
	createComposeByTemplate,
	createDomain,
	createMount,
	deleteMount,
	deprovisionCloudflareForDomains,
	execAsync,
	execAsyncRemote,
	executeTransfer,
	findComposeById,
	findDomainsByComposeId,
	findEnvironmentById,
	findProjectById,
	findServerById,
	getAccessibleServerIds,
	getComposeBuildOverridePath,
	getComposeContainer,
	getContainerLogs,
	getWebServerSettings,
	IS_CLOUD,
	// build-policy hook: narrows a thrown support error to a 400.
	isBuildPolicyError,
	loadServices,
	paths,
	processTemplate,
	randomizeComposeFile,
	randomizeIsolatedDeploymentComposeFile,
	removeCompose,
	removeComposeDirectory,
	removeDeploymentsByComposeId,
	removeDomainById,
	scanServiceForTransfer,
	startCompose,
	stopCompose,
	updateCompose,
	updateDeploymentStatus,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { canEditDeployGitSource } from "@dokploy/server/services/git-provider";
import {
	addNewService,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import {
	type CompleteTemplate,
	fetchTemplateFiles,
	fetchTemplateLogo,
	fetchTemplatesList,
} from "@dokploy/server/templates/github";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import _ from "lodash";
import { nanoid } from "nanoid";
import { quote } from "shell-quote";
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
	apiTransferCompose,
	apiUpdateCompose,
	compose as composeTable,
	environments,
	projects,
} from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import {
	cleanQueuesByCompose,
	killDockerBuild,
	myQueue,
} from "@/server/queues/queueSetup";
import { applyTemplateToCompose } from "@/server/utils/apply-template";
import { cancelDeployment, deploy } from "@/server/utils/deploy";
import {
	runTransferWithDowntime,
	validateTransferTargetServer,
} from "@/server/utils/transfer";
import { generatePassword } from "@/templates/utils";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { audit } from "../utils/audit";

export const composeRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateCompose)
		.mutation(async ({ ctx, input }) => {
			try {
				const environment = await findEnvironmentById(input.environmentId);
				const project = await findProjectById(environment.projectId);

				await checkServiceAccess(ctx, project.projectId, "create");

				const webServerSettings = await getWebServerSettings();
				if (
					(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
					!input.serverId
				) {
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
				const canEdit = await canEditDeployGitSource(
					gitProviderId,
					ctx.session,
				);
				if (!canEdit) {
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
		.input(apiUpdateCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});

			// Build server: the caller must be allowed to use the server (same check
			// as applications), and the settings as a whole must be valid. Checked
			// against the merged result, so clearing the registry on its own, or
			// adding a custom command to a build-server compose, is refused too.
			if (
				input.buildServerId !== undefined ||
				input.buildRegistryId !== undefined ||
				input.command !== undefined
			) {
				if (input.buildServerId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.buildServerId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this build server",
						});
					}
				}
				const existing = await findComposeById(input.composeId);
				await assertComposeBuildSettings(
					{
						buildServerId:
							input.buildServerId !== undefined
								? input.buildServerId
								: existing.buildServerId,
						buildRegistryId:
							input.buildRegistryId !== undefined
								? input.buildRegistryId
								: existing.buildRegistryId,
						command:
							input.command !== undefined ? input.command : existing.command,
					},
					ctx.session.activeOrganizationId,
				);
			}

			// >>> build-policy hook: refuse a required check this compose unit can
			// never satisfy, here rather than on every deploy. Same rule and the
			// same message as the application path. See finding F in the round-2
			// review and build-policy/source.ts.
			if (input.requiredChecks !== undefined) {
				const current = await findComposeById(input.composeId);
				try {
					assertRequiredChecksSupportedForUpdate(
						{
							unitName: current.name,
							sourceType: current.sourceType,
							githubId: current.githubId,
							owner: current.owner,
							repository: current.repository,
							customGitUrl: current.customGitUrl,
						},
						{ ...input, unitName: current.name },
					);
				} catch (error) {
					if (isBuildPolicyError(error)) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: error.message,
						});
					}
					throw error;
				}
			}
			// <<< build-policy hook

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
		.input(apiSaveEnvironmentVariablesCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				envVars: ["write"],
			});
			const updated = await updateCompose(input.composeId, {
				env: input.env,
				createEnvFile: input.createEnvFile,
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

			// Domains are FK-cascade deleted with the compose, so de-provision any
			// Cloudflare publishing BEFORE the row (and its domains) is removed.
			const composeDomains = await findDomainsByComposeId(input.composeId);
			await deprovisionCloudflareForDomains(composeDomains);

			const result = await db
				.delete(composeTable)
				.where(eq(composeTable.composeId, input.composeId))
				.returning();

			if (!IS_CLOUD) {
				await cleanQueuesByCompose(input.composeId);
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
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			await cleanQueuesByCompose(input.composeId);
			return { success: true, message: "Queues cleaned successfully" };
		}),
	clearDeployments: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			await clearOldDeployments(compose.composeId, "compose");
			await audit(ctx, {
				action: "update",
				resourceType: "compose",
				resourceId: input.composeId,
				resourceName: compose.name,
			});
			return true;
		}),
	killBuild: protectedProcedure
		.input(apiFindCompose)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				deployment: ["cancel"],
			});
			const compose = await findComposeById(input.composeId);
			await killDockerBuild("compose", compose.serverId);
		}),

	loadServices: protectedProcedure
		.input(apiFetchServices)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["read"],
			});
			return await loadServices(input.composeId, input.type);
		}),
	loadMountsByService: protectedProcedure
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
				serverId: compose.serverId ?? undefined,
				freshVolumes: input.freshVolumes,
			};

			if (IS_CLOUD && compose.serverId) {
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
				serverId: compose.serverId ?? undefined,
				freshVolumes: input.freshVolumes,
			};
			if (IS_CLOUD && compose.serverId) {
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
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			const { COMPOSE_PATH } = paths(!!compose.serverId);
			const projectPath = join(COMPOSE_PATH, compose.appName, "code");
			const command = createCommand(
				compose,
				compose.mounts.length > 0 ? projectPath : undefined,
				compose.buildServerId
					? { overridePath: getComposeBuildOverridePath(compose) }
					: undefined,
			);
			return `docker ${command}`;
		}),
	refreshToken: protectedProcedure
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
	loadTemplateFromGit: protectedProcedure
		.input(z.object({ composeId: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				service: ["create"],
			});
			const compose = await findComposeById(input.composeId);
			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this compose",
				});
			}

			const tempAppName = `${compose.appName}-temp-template-${nanoid()}`;

			const entity = {
				...compose,
				appName: tempAppName,
				type: "compose" as const,
			};

			let command = "set -e;";
			if (compose.sourceType === "github") {
				command += await cloneGithubRepository(entity);
			} else if (compose.sourceType === "gitlab") {
				command += await cloneGitlabRepository(entity);
			} else if (compose.sourceType === "bitbucket") {
				command += await cloneBitbucketRepository(entity);
			} else if (compose.sourceType === "git") {
				command += await cloneGitRepository(entity);
			} else if (compose.sourceType === "gitea") {
				command += await cloneGiteaRepository(entity);
			}

			const { COMPOSE_PATH } = paths(!!compose.serverId);
			const tempPath = join(COMPOSE_PATH, tempAppName, "code");
			const composeDir = dirname(compose.composePath || "./docker-compose.yml");
			const templatePath = join(tempPath, composeDir, "template.toml");

			const readCommand = quote(["cat", templatePath]);
			const cleanCommand = quote([
				"rm",
				"-rf",
				join(COMPOSE_PATH, tempAppName),
			]);

			try {
				if (compose.serverId) {
					await execAsyncRemote(compose.serverId, command);
				} else {
					await execAsync(command);
				}

				let templateContent = "";
				try {
					if (compose.serverId) {
						const { stdout } = await execAsyncRemote(
							compose.serverId,
							readCommand,
						);
						templateContent = stdout;
					} else {
						const { stdout } = await execAsync(readCommand);
						templateContent = stdout;
					}
				} catch (e) {
					if (compose.serverId) {
						await execAsyncRemote(compose.serverId, cleanCommand);
					} else {
						await execAsync(cleanCommand);
					}
					return null;
				}

				if (compose.serverId) {
					await execAsyncRemote(compose.serverId, cleanCommand);
				} else {
					await execAsync(cleanCommand);
				}

				const config = parse(templateContent) as CompleteTemplate;

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

				await applyTemplateToCompose(compose, processedTemplate);

				return {
					success: true,
					message: "Template loaded and applied successfully",
				};
			} catch (error) {
				try {
					if (compose.serverId) {
						await execAsyncRemote(compose.serverId, cleanCommand);
					} else {
						await execAsync(cleanCommand);
					}
				} catch {}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Error loading template from git: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				});
			}
		}),
	deployTemplate: protectedProcedure
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

			const webServerSettings = await getWebServerSettings();
			if (
				(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
				!input.serverId
			) {
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

			const [template, templateLogo] = await Promise.all([
				fetchTemplateFiles(input.id, input.baseUrl),
				fetchTemplateLogo(input.id, input.baseUrl),
			]);

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
				icon: templateLogo,
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
		.input(z.object({ baseUrl: z.string().optional() }))
		.query(async ({ input }) => {
			try {
				const githubTemplates = await fetchTemplatesList(input.baseUrl);
				const allTags = githubTemplates.flatMap((template) => template.tags);
				return _.uniq(allTags);
			} catch (error) {
				console.warn("Failed to fetch template tags:", error);
				return [];
			}
		}),
	disconnectGitProvider: protectedProcedure
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
					message: `Error processing template: ${
						error instanceof Error ? error.message : error
					}`,
				});
			}
		}),

	previewTemplate: protectedProcedure
		.input(
			z.object({
				base64: z.string(),
				appName: z.string(),
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				if (input.serverId) {
					const accessibleIds = await getAccessibleServerIds(ctx.session);
					if (!accessibleIds.has(input.serverId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You are not authorized to access this server",
						});
					}
				}

				const decodedData = Buffer.from(input.base64, "base64").toString(
					"utf-8",
				);

				let serverIp = "127.0.0.1";

				if (input.serverId) {
					const server = await findServerById(input.serverId);
					serverIp = server.ipAddress;
				} else if (process.env.NODE_ENV !== "development") {
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
						APP_NAME: input.appName,
						...config.variables,
					},
				};

				const processedTemplate = processTemplate(configModified, {
					serverIp,
					projectName: input.appName,
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

				// Tear down Cloudflare publishing before the domain rows are deleted,
				// otherwise the stored tunnel/DNS/ingress state is orphaned.
				await deprovisionCloudflareForDomains(compose.domains);
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
				// `applyTemplateToCompose` already persists `template.envs` as the
				// compose env, so no `env` option is needed here.
				await applyTemplateToCompose(compose, processedTemplate, {
					composeFile: templateData.compose,
					sourceType: "raw",
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
					message: `Error importing template: ${
						error instanceof Error ? error.message : error
					}`,
				});
			}
		}),

	cancelDeployment: protectedProcedure
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

	// Scan compose for transfer — pre-flight check
	transferScan: protectedProcedure
		.input(apiTransferCompose)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this compose",
				});
			}

			await checkServiceAccess(ctx, input.composeId, "delete");

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: compose.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return scanServiceForTransfer({
				serviceId: input.composeId,
				serviceType: "compose",
				appName: compose.appName,
				sourceServerId: compose.serverId,
				targetServerId,
			});
		}),

	transferScanWithLogs: protectedProcedure
		.meta({
			openapi: {
				enabled: false,
				method: "POST",
				path: "/compose.transferScanWithLogs",
			},
		})
		.input(apiTransferCompose)
		.subscription(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this compose",
				});
			}

			await checkServiceAccess(ctx, input.composeId, "delete");

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: compose.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return observable<string>((emit) => {
				scanServiceForTransfer(
					{
						serviceId: input.composeId,
						serviceType: "compose",
						appName: compose.appName,
						sourceServerId: compose.serverId,
						targetServerId,
					},
					(progress) => {
						emit.next(
							JSON.stringify({
								type: "scan_progress",
								payload: progress,
							}),
						);
					},
				)
					.then((result) => {
						emit.next(
							JSON.stringify({
								type: "scan_complete",
								payload: result,
							}),
						);
						emit.complete();
					})
					.catch((error) => {
						const message =
							error instanceof Error ? error.message : "Unknown scan error";
						emit.next(
							JSON.stringify({
								type: "scan_error",
								payload: { message },
							}),
						);
						emit.complete();
					});
			});
		}),

	// Transfer compose to a different server (node)
	transfer: protectedProcedure
		.input(
			apiTransferCompose.extend({
				decisions: z
					.record(z.string(), z.enum(["skip", "overwrite"]))
					.optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this compose",
				});
			}

			await checkServiceAccess(ctx, input.composeId, "delete");

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: compose.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			const result = await runTransferWithDowntime({
				stopSource: async () => {
					await stopCompose(input.composeId);
				},
				startSource: async () => {
					await startCompose(input.composeId);
				},
				executeTransfer: async () =>
					executeTransfer(
						{
							serviceId: input.composeId,
							serviceType: "compose",
							appName: compose.appName,
							sourceServerId: compose.serverId,
							targetServerId,
						},
						input.decisions || {},
						(_progress) => {},
					),
				commitTransfer: async () => {
					await db
						.update(composeTable)
						.set({ serverId: targetServerId })
						.where(eq(composeTable.composeId, input.composeId));
				},
			});

			if (!result.success) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Transfer failed: ${result.errors.join(", ")}`,
				});
			}

			return { success: true };
		}),

	transferWithLogs: protectedProcedure
		.meta({
			openapi: {
				enabled: false,
				method: "POST",
				path: "/compose.transferWithLogs",
			},
		})
		.input(
			apiTransferCompose.extend({
				decisions: z
					.record(z.string(), z.enum(["skip", "overwrite"]))
					.optional(),
			}),
		)
		.subscription(async ({ input, ctx }) => {
			const compose = await findComposeById(input.composeId);

			if (
				compose.environment.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to transfer this compose",
				});
			}

			await checkServiceAccess(ctx, input.composeId, "delete");

			const targetServerId = await validateTransferTargetServer({
				targetServerId: input.targetServerId,
				sourceServerId: compose.serverId,
				organizationId: ctx.session.activeOrganizationId,
			});

			return observable<string>((emit) => {
				runTransferWithDowntime({
					stopSource: async () => {
						await stopCompose(input.composeId);
					},
					startSource: async () => {
						await startCompose(input.composeId);
					},
					executeTransfer: async () =>
						executeTransfer(
							{
								serviceId: input.composeId,
								serviceType: "compose",
								appName: compose.appName,
								sourceServerId: compose.serverId,
								targetServerId,
							},
							input.decisions || {},
							(progress) => {
								emit.next(JSON.stringify(progress));
							},
						),
					commitTransfer: async () => {
						await db
							.update(composeTable)
							.set({ serverId: targetServerId })
							.where(eq(composeTable.composeId, input.composeId));
					},
				})
					.then((result) => {
						if (result.success) {
							emit.next("Transfer completed successfully!");
						} else {
							const errorMessage = result.errors.join(", ") || "Unknown error";
							emit.next(`Transfer failed: ${errorMessage}`);
						}
						emit.complete();
					})
					.catch((error) => {
						const message =
							error instanceof Error ? error.message : "Unknown transfer error";
						emit.next(`Transfer failed: ${message}`);
						emit.complete();
					});
			});
		}),
});
