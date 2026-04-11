import {
	CLEANUP_CRON_JOB,
	checkGPUStatus,
	checkPortInUse,
	checkPostgresHealth,
	checkRedisHealth,
	checkTraefikHealth,
	cleanupAll,
	cleanupAllBackground,
	cleanupBuilders,
	cleanupContainers,
	cleanupImages,
	cleanupSystem,
	cleanupVolumes,
	DEFAULT_UPDATE_DATA,
	execAsync,
	findServerById,
	getDockerDiskUsage,
	getDokployImageTag,
	getLogCleanupStatus,
	getUpdateData,
	getWebServerSettings,
	IS_CLOUD,
	parseRawConfig,
	paths,
	prepareEnvironmentVariables,
	processLogs,
	readConfig,
	readConfigInPath,
	readDirectory,
	readEnvironmentVariables,
	readMainConfig,
	readMonitoringConfig,
	readPorts,
	recreateDirectory,
	reloadDockerResource,
	sendDockerCleanupNotifications,
	setupGPUSupport,
	spawnAsync,
	startLogCleanup,
	stopLogCleanup,
	updateLetsEncryptEmail,
	updateServerById,
	updateServerTraefik,
	updateWebServerSettings,
	writeConfig,
	writeMainConfig,
	writeTraefikConfigInPath,
	writeTraefikSetup,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { checkPermission } from "@dokploy/server/services/permission";
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { tryCatch } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiAssignDomain,
	apiEnableDashboard,
	apiModifyTraefikConfig,
	apiReadStatsLogs,
	apiReadTraefikConfig,
	apiSaveSSHKey,
	apiServerSchema,
	apiTraefikConfig,
	apiUpdateDockerCleanup,
	projects,
	server,
} from "@/server/db/schema";
import { cleanAllDeploymentQueue } from "@/server/queues/queueSetup";
import { removeJob, schedule } from "@/server/utils/backup";
import packageInfo from "../../../package.json";
import { appRouter } from "../root";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "../trpc";

export const settingsRouter = createTRPCRouter({
	getWebServerSettings: protectedProcedure
		.meta({
			openapi: {
				summary: "Get web server settings",
				description:
					"Retrieve the current web server settings. Returns null on cloud.",
			},
		})
		.query(async () => {
			if (IS_CLOUD) {
				return null;
			}
			const settings = await getWebServerSettings();
			return settings;
		}),
	reloadServer: adminProcedure
		.meta({
			openapi: {
				summary: "Reload Dokploy server",
				description:
					"Reload the Dokploy Docker service with the current version. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			await reloadDockerResource("dokploy", undefined, packageInfo.version);
			await audit(ctx, {
				action: "reload",
				resourceType: "settings",
				resourceName: "dokploy",
			});
			return true;
		}),
	cleanRedis: adminProcedure
		.meta({
			openapi: {
				summary: "Flush Redis data",
				description:
					"Execute FLUSHALL on the Dokploy Redis container, removing all cached data. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}

			const { stdout: containerId } = await execAsync(
				`docker ps --filter "name=dokploy-redis" --filter "status=running" -q | head -n 1`,
			);

			if (!containerId) {
				throw new Error("Redis container not found");
			}

			const redisContainerId = containerId.trim();

			await execAsync(`docker exec -i ${redisContainerId} redis-cli flushall`);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "clean-redis",
			});
			return true;
		}),
	reloadRedis: adminProcedure
		.meta({
			openapi: {
				summary: "Reload Redis service",
				description:
					"Force-reload the Dokploy Redis Docker service. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			await reloadDockerResource("dokploy-redis");
			await audit(ctx, {
				action: "reload",
				resourceType: "settings",
				resourceName: "dokploy-redis",
			});
			return true;
		}),
	cleanAllDeploymentQueue: adminProcedure
		.meta({
			openapi: {
				summary: "Clean all deployment queues",
				description:
					"Remove all pending jobs from the deployment queue. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const result = cleanAllDeploymentQueue();
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "clean-deployment-queue",
			});
			return result;
		}),
	reloadTraefik: adminProcedure
		.meta({
			openapi: {
				summary: "Reload Traefik service",
				description:
					"Force-reload the Dokploy Traefik Docker service. Runs in the background to avoid proxy timeouts. Optionally targets a specific server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			// Run in background so the request returns immediately; avoids proxy timeouts.
			void reloadDockerResource("dokploy-traefik", input?.serverId).catch(
				(err) => {
					console.error("reloadTraefik background:", err);
				},
			);
			await audit(ctx, {
				action: "reload",
				resourceType: "settings",
				resourceName: "dokploy-traefik",
			});
			return true;
		}),
	toggleDashboard: adminProcedure
		.meta({
			openapi: {
				summary: "Toggle Traefik dashboard",
				description:
					"Enable or disable the Traefik dashboard by adding or removing port 8080. Checks for port conflicts before enabling. Runs the Traefik setup in the background.",
			},
		})
		.input(apiEnableDashboard)
		.mutation(async ({ input, ctx }) => {
			const ports = await readPorts("dokploy-traefik", input.serverId);
			const env = await readEnvironmentVariables(
				"dokploy-traefik",
				input.serverId,
			);
			const preparedEnv = prepareEnvironmentVariables(env);
			let newPorts = ports;
			// If receive true, add 8080 to ports
			if (input.enableDashboard) {
				// Check if port 8080 is already in use before enabling dashboard
				const portCheck = await checkPortInUse(8080, input.serverId);
				if (portCheck.isInUse) {
					const conflictInfo = portCheck.conflictingContainer
						? ` by ${portCheck.conflictingContainer}`
						: "";
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port 8080 is already in use${conflictInfo}. Please stop the conflicting service or use a different port for the Traefik dashboard.`,
					});
				}
				newPorts.push({
					targetPort: 8080,
					publishedPort: 8080,
					protocol: "tcp",
				});
			} else {
				newPorts = ports.filter((port) => port.targetPort !== 8080);
			}

			// Run in background so the request returns immediately; client polls /api/health.
			// Avoids proxy timeouts (520) while Traefik is recreated.
			void writeTraefikSetup({
				env: preparedEnv,
				additionalPorts: newPorts,
				serverId: input.serverId,
			}).catch((err) => {
				console.error("toggleDashboard background writeTraefikSetup:", err);
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "toggle-dashboard",
			});
			return true;
		}),
	cleanUnusedImages: adminProcedure
		.meta({
			openapi: {
				summary: "Clean unused Docker images",
				description:
					"Remove all unused Docker images from the host or a specified server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await cleanupImages(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-unused-images",
			});
			return true;
		}),
	cleanUnusedVolumes: adminProcedure
		.meta({
			openapi: {
				summary: "Clean unused Docker volumes",
				description:
					"Remove all unused Docker volumes from the host or a specified server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await cleanupVolumes(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-unused-volumes",
			});
			return true;
		}),
	cleanStoppedContainers: adminProcedure
		.meta({
			openapi: {
				summary: "Clean stopped Docker containers",
				description:
					"Remove all stopped Docker containers from the host or a specified server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await cleanupContainers(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-stopped-containers",
			});
			return true;
		}),
	cleanDockerBuilder: adminProcedure
		.meta({
			openapi: {
				summary: "Clean Docker build cache",
				description:
					"Remove Docker builder cache from the host or a specified server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await cleanupBuilders(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-docker-builder",
			});
		}),
	cleanDockerPrune: adminProcedure
		.meta({
			openapi: {
				summary: "Prune Docker system",
				description:
					"Run a full Docker system prune and builder cache cleanup on the host or a specified server.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await cleanupSystem(input?.serverId);
			await cleanupBuilders(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-docker-prune",
			});
			return true;
		}),
	cleanAll: adminProcedure
		.meta({
			openapi: {
				summary: "Clean all Docker resources",
				description:
					"Run a comprehensive Docker cleanup (images, containers, volumes, builders, system prune) in the background to avoid gateway timeouts.",
			},
		})
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			// Execute cleanup in background and return immediately to avoid gateway timeouts
			const result = await cleanupAllBackground(input?.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-all",
			});
			return result;
		}),
	cleanMonitoring: adminProcedure
		.meta({
			openapi: {
				summary: "Clean monitoring data",
				description:
					"Delete and recreate the monitoring data directory, removing all collected metrics. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const { MONITORING_PATH } = paths();
			await recreateDirectory(MONITORING_PATH);
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "clean-monitoring",
			});
			return true;
		}),
	getDockerDiskUsage: adminProcedure
		.meta({
			openapi: {
				summary: "Get Docker disk usage",
				description:
					"Retrieve Docker disk usage statistics. Returns an empty array on cloud.",
			},
		})
		.query(async () => {
			if (IS_CLOUD) {
				return [];
			}
			return getDockerDiskUsage();
		}),
	saveSSHPrivateKey: adminProcedure
		.meta({
			openapi: {
				summary: "Save SSH private key",
				description:
					"Store an SSH private key in the web server settings for remote server access. Disabled on cloud.",
			},
		})
		.input(apiSaveSSHKey)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			await updateWebServerSettings({
				sshPrivateKey: input.sshPrivateKey,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "ssh-private-key",
			});
			return true;
		}),
	assignDomainServer: adminProcedure
		.meta({
			openapi: {
				summary: "Assign domain to server",
				description:
					"Configure the server domain, HTTPS settings, certificate type, and Let's Encrypt email. Updates both web server settings and Traefik configuration. Disabled on cloud.",
			},
		})
		.input(apiAssignDomain)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const settings = await updateWebServerSettings({
				host: input.host,
				letsEncryptEmail: input.letsEncryptEmail,
				certificateType: input.certificateType,
				https: input.https,
			});

			if (!settings) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Web server settings not found",
				});
			}

			updateServerTraefik(settings, input.host);
			if (input.letsEncryptEmail) {
				updateLetsEncryptEmail(input.letsEncryptEmail);
			}

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "assign-domain-server",
			});
			return settings;
		}),
	cleanSSHPrivateKey: adminProcedure
		.meta({
			openapi: {
				summary: "Remove SSH private key",
				description:
					"Clear the stored SSH private key from web server settings. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			await updateWebServerSettings({
				sshPrivateKey: null,
			});
			await audit(ctx, {
				action: "delete",
				resourceType: "settings",
				resourceName: "ssh-private-key",
			});
			return true;
		}),
	updateDockerCleanup: adminProcedure
		.meta({
			openapi: {
				summary: "Update Docker cleanup schedule",
				description:
					"Enable or disable automatic Docker cleanup for a server or the web server. When enabled, schedules a cron job that periodically removes unused Docker resources and sends notifications.",
			},
		})
		.input(apiUpdateDockerCleanup)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				await updateServerById(input.serverId, {
					enableDockerCleanup: input.enableDockerCleanup,
				});

				const server = await findServerById(input.serverId);

				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}

				if (server.enableDockerCleanup) {
					const server = await findServerById(input.serverId);
					if (server.serverStatus === "inactive") {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Server is inactive",
						});
					}
					if (IS_CLOUD) {
						await schedule({
							cronSchedule: CLEANUP_CRON_JOB,
							serverId: input.serverId,
							type: "server",
						});
					} else {
						scheduleJob(server.serverId, CLEANUP_CRON_JOB, async () => {
							console.log(
								`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
							);

							await cleanupAll(server.serverId);

							await sendDockerCleanupNotifications(server.organizationId);
						});
					}
				} else {
					if (IS_CLOUD) {
						await removeJob({
							cronSchedule: CLEANUP_CRON_JOB,
							serverId: input.serverId,
							type: "server",
						});
					} else {
						const currentJob = scheduledJobs[server.serverId];
						currentJob?.cancel();
					}
				}
			} else if (!IS_CLOUD) {
				const settingsUpdated = await updateWebServerSettings({
					enableDockerCleanup: input.enableDockerCleanup,
				});

				if (settingsUpdated?.enableDockerCleanup) {
					scheduleJob("docker-cleanup", CLEANUP_CRON_JOB, async () => {
						console.log(
							`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
						);

						await cleanupAll();

						await sendDockerCleanupNotifications(
							ctx.session.activeOrganizationId,
						);
					});
				} else {
					const currentJob = scheduledJobs["docker-cleanup"];
					currentJob?.cancel();
				}
			}

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "docker-cleanup",
			});
			return true;
		}),

	readTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Read main Traefik configuration",
				description:
					"Read the main Traefik configuration file. Disabled on cloud.",
			},
		})
		.query(() => {
			if (IS_CLOUD) {
				return true;
			}
			const traefikConfig = readMainConfig();
			return traefikConfig;
		}),

	updateTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Update main Traefik configuration",
				description:
					"Overwrite the main Traefik configuration file with the provided content. Disabled on cloud.",
			},
		})
		.input(apiTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeMainConfig(input.traefikConfig);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "traefik-config",
			});
			return true;
		}),

	readWebServerTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Read web server Traefik configuration",
				description:
					"Read the Dokploy-specific Traefik configuration file. Disabled on cloud.",
			},
		})
		.query(() => {
			if (IS_CLOUD) {
				return true;
			}
			const traefikConfig = readConfig("dokploy");
			return traefikConfig;
		}),
	updateWebServerTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Update web server Traefik configuration",
				description:
					"Overwrite the Dokploy-specific Traefik configuration file with the provided content. Disabled on cloud.",
			},
		})
		.input(apiTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeConfig("dokploy", input.traefikConfig);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "web-server-traefik-config",
			});
			return true;
		}),

	readMiddlewareTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Read middleware Traefik configuration",
				description:
					"Read the Traefik middlewares configuration file. Disabled on cloud.",
			},
		})
		.query(() => {
			if (IS_CLOUD) {
				return true;
			}
			const traefikConfig = readConfig("middlewares");
			return traefikConfig;
		}),

	updateMiddlewareTraefikConfig: adminProcedure
		.meta({
			openapi: {
				summary: "Update middleware Traefik configuration",
				description:
					"Overwrite the Traefik middlewares configuration file with the provided content. Disabled on cloud.",
			},
		})
		.input(apiTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeConfig("middlewares", input.traefikConfig);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "middleware-traefik-config",
			});
			return true;
		}),
	getUpdateData: protectedProcedure
		.meta({
			openapi: {
				summary: "Check for Dokploy updates",
				description:
					"Check whether a newer version of Dokploy is available. Returns default data on cloud.",
			},
		})
		.mutation(async () => {
			if (IS_CLOUD) {
				return DEFAULT_UPDATE_DATA;
			}

			return await getUpdateData(packageInfo.version);
		}),
	updateServer: adminProcedure
		.meta({
			openapi: {
				summary: "Update Dokploy to latest version",
				description:
					"Pull the latest Dokploy Docker image and update the service if a new version is available. Disabled on cloud.",
			},
		})
		.mutation(async ({ ctx }) => {
			if (IS_CLOUD) {
				return true;
			}

			const data = await getUpdateData(packageInfo.version);
			if (data.updateAvailable) {
				void spawnAsync("docker", [
					"service",
					"update",
					"--force",
					"--image",
					`dokploy/dokploy:${data.latestVersion}`,
					"dokploy",
				]);
				await audit(ctx, {
					action: "update",
					resourceType: "settings",
					resourceName: "dokploy-version",
				});
			}

			return true;
		}),

	getDokployVersion: protectedProcedure
		.meta({
			openapi: {
				summary: "Get Dokploy version",
				description:
					"Return the currently running Dokploy version from package.json.",
			},
		})
		.query(() => {
			return packageInfo.version;
		}),
	getReleaseTag: protectedProcedure
		.meta({
			openapi: {
				summary: "Get Dokploy release tag",
				description:
					"Return the Docker image tag of the running Dokploy instance.",
			},
		})
		.query(() => {
			return getDokployImageTag();
		}),
	readDirectories: protectedProcedure
		.meta({
			openapi: {
				summary: "List Traefik configuration directories",
				description:
					"Read the directory listing of the main Traefik configuration path. Requires traefikFiles.read permission.",
			},
		})
		.input(apiServerSchema)
		.query(async ({ ctx, input }) => {
			try {
				await checkPermission(ctx, { traefikFiles: ["read"] });
				const { MAIN_TRAEFIK_PATH } = paths(!!input?.serverId);
				const result = await readDirectory(MAIN_TRAEFIK_PATH, input?.serverId);
				return result || [];
			} catch (error) {
				throw error;
			}
		}),

	updateTraefikFile: protectedProcedure
		.meta({
			openapi: {
				summary: "Update a Traefik configuration file",
				description:
					"Write content to a specific Traefik configuration file at the given path. Requires traefikFiles.write permission.",
			},
		})
		.input(apiModifyTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			await checkPermission(ctx, { traefikFiles: ["write"] });
			await writeTraefikConfigInPath(
				input.path,
				input.traefikConfig,
				input?.serverId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "traefik-file",
			});
			return true;
		}),

	readTraefikFile: protectedProcedure
		.meta({
			openapi: {
				summary: "Read a Traefik configuration file",
				description:
					"Read the content of a specific Traefik configuration file at the given path. Requires traefikFiles.read permission. Validates server ownership when a serverId is provided.",
			},
		})
		.input(apiReadTraefikConfig)
		.query(async ({ input, ctx }) => {
			await checkPermission(ctx, { traefikFiles: ["read"] });

			if (input.serverId) {
				const server = await findServerById(input.serverId);

				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			return readConfigInPath(input.path, input.serverId);
		}),
	getIp: protectedProcedure
		.meta({
			openapi: {
				summary: "Get server IP address",
				description:
					"Return the configured server IP address from web server settings. Returns an empty string on cloud.",
			},
		})
		.query(async () => {
			if (IS_CLOUD) {
				return "";
			}
			const settings = await getWebServerSettings();
			return settings?.serverIp || "";
		}),
	updateServerIp: adminProcedure
		.meta({
			openapi: {
				summary: "Update server IP address",
				description:
					"Update the server IP address stored in web server settings. Disabled on cloud.",
			},
		})
		.input(
			z.object({
				serverIp: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const settings = await updateWebServerSettings({
				serverIp: input.serverIp,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "server-ip",
			});
			return settings;
		}),

	getOpenApiDocument: protectedProcedure
		.meta({
			openapi: {
				summary: "Get OpenAPI specification",
				description:
					"Generate and return the full OpenAPI document for the Dokploy API, including all endpoints, tags, and security schemes.",
			},
		})
		.query(async ({ ctx }): Promise<unknown> => {
			try {
				const protocol = ctx.req.headers["x-forwarded-proto"];
				const url = `${protocol}://${ctx.req.headers.host}/api`;
				const openApiDocument = generateOpenApiDocument(appRouter, {
					title: "tRPC OpenAPI",
					version: packageInfo.version,
					baseUrl: url,
					docsUrl: `${url}/settings.getOpenApiDocument`,
					tags: [
						"admin",
						"docker",
						"compose",
						"registry",
						"cluster",
						"user",
						"domain",
						"destination",
						"backup",
						"deployment",
						"mounts",
						"certificates",
						"settings",
						"security",
						"redirects",
						"port",
						"project",
						"application",
						"mysql",
						"postgres",
						"redis",
						"mongo",
						"libsql",
						"mariadb",
						"sshRouter",
						"gitProvider",
						"bitbucket",
						"ai",
						"github",
						"gitlab",
						"gitea",
						"tag",
						"patch",
						"server",
						"volumeBackups",
						"environment",
						"auditLog",
						"customRole",
						"whitelabeling",
						"sso",
						"licenseKey",
						"organization",
						"previewDeployment",
					],
				});

				openApiDocument.info = {
					title: "Dokploy API",
					description: "Endpoints for dokploy",
					version: packageInfo.version,
				};

				// Add security schemes configuration
				openApiDocument.components = {
					...openApiDocument.components,
					securitySchemes: {
						apiKey: {
							type: "apiKey",
							in: "header",
							name: "x-api-key",
							description: "API key authentication",
						},
					},
				};

				// Apply security globally to all endpoints
				openApiDocument.security = [
					{
						apiKey: [],
					},
				];
				return openApiDocument;
			} catch (error) {
				console.log(error);
			}
		}),
	readTraefikEnv: adminProcedure
		.meta({
			openapi: {
				summary: "Read Traefik environment variables",
				description:
					"Retrieve the environment variables configured for the Dokploy Traefik service, optionally for a specific server.",
			},
		})
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const envVars = await readEnvironmentVariables(
				"dokploy-traefik",
				input?.serverId,
			);
			return envVars;
		}),

	writeTraefikEnv: adminProcedure
		.meta({
			openapi: {
				summary: "Write Traefik environment variables",
				description:
					"Update the environment variables for the Dokploy Traefik service and restart it in the background. Preserves the current port configuration.",
			},
		})
		.input(z.object({ env: z.string(), serverId: z.string().optional() }))
		.mutation(async ({ input, ctx }) => {
			const envs = prepareEnvironmentVariables(input.env);
			const ports = await readPorts("dokploy-traefik", input?.serverId);

			// Run in background so the request returns immediately; client polls /api/health.
			void writeTraefikSetup({
				env: envs,
				additionalPorts: ports,
				serverId: input.serverId,
			}).catch((err) => {
				console.error("writeTraefikEnv background writeTraefikSetup:", err);
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "traefik-env",
			});
			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure
		.meta({
			openapi: {
				summary: "Check Traefik dashboard port status",
				description:
					"Check whether port 8080 (Traefik dashboard) is currently enabled in the Traefik service port configuration.",
			},
		})
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports.some((port) => port.targetPort === 8080);
		}),

	readStatsLogs: protectedProcedure
		.meta({
			openapi: {
				path: "/read-stats-logs",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiReadStatsLogs)
		.query(async ({ input }) => {
			if (IS_CLOUD) {
				return {
					data: [],
					totalCount: 0,
				};
			}
			const rawConfig = await readMonitoringConfig(
				!!input.dateRange?.start && !!input.dateRange?.end,
			);

			const parsedConfig = parseRawConfig(
				rawConfig as string,
				input.page,
				input.sort,
				input.search,
				input.status,
				input.dateRange,
			);

			return parsedConfig;
		}),
	readStats: adminProcedure
		.meta({
			openapi: {
				path: "/read-stats",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(
			z
				.object({
					dateRange: z
						.object({
							start: z.string().optional(),
							end: z.string().optional(),
						})
						.optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			if (IS_CLOUD) {
				return [];
			}
			const rawConfig = await readMonitoringConfig(
				!!input?.dateRange?.start || !!input?.dateRange?.end,
			);
			const processedLogs = processLogs(rawConfig as string, input?.dateRange);
			return processedLogs || [];
		}),
	haveActivateRequests: protectedProcedure
		.meta({
			openapi: {
				summary: "Check if request logging is active",
				description:
					"Check whether Traefik access log (request logging) is enabled by inspecting the main Traefik configuration. Returns true on cloud.",
			},
		})
		.query(async () => {
			if (IS_CLOUD) {
				return true;
			}
			const config = readMainConfig();

			if (!config) return false;
			const parsedConfig = parse(config) as {
				accessLog?: {
					filePath: string;
				};
			};

			return !!parsedConfig?.accessLog?.filePath;
		}),
	toggleRequests: protectedProcedure
		.meta({
			openapi: {
				summary: "Toggle request logging",
				description:
					"Enable or disable Traefik access log (request logging) by updating the main Traefik configuration file. Disabled on cloud.",
			},
		})
		.input(
			z.object({
				enable: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const mainConfig = readMainConfig();
			if (!mainConfig) return false;

			const currentConfig = parse(mainConfig) as {
				accessLog?: {
					filePath: string;
				};
			};

			if (input.enable) {
				const config = {
					accessLog: {
						filePath: "/etc/dokploy/traefik/dynamic/access.log",
						format: "json",
						bufferingSize: 100,
					},
				};
				currentConfig.accessLog = config.accessLog;
			} else {
				currentConfig.accessLog = undefined;
			}

			writeMainConfig(stringify(currentConfig));
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "toggle-requests",
			});
			return true;
		}),
	isCloud: publicProcedure
		.meta({
			openapi: {
				summary: "Check if running on cloud",
				description:
					"Return whether this Dokploy instance is running in cloud mode.",
			},
		})
		.query(async () => {
			return IS_CLOUD;
		}),
	isUserSubscribed: protectedProcedure
		.meta({
			openapi: {
				summary: "Check if user has resources",
				description:
					"Check whether the current organization has any servers or projects, indicating active usage.",
			},
		})
		.query(async ({ ctx }) => {
			const haveServers = await db.query.server.findMany({
				where: eq(
					server.organizationId,
					ctx.session?.activeOrganizationId || "",
				),
			});
			const haveProjects = await db.query.projects.findMany({
				where: eq(
					projects.organizationId,
					ctx.session?.activeOrganizationId || "",
				),
			});
			return haveServers.length > 0 || haveProjects.length > 0;
		}),
	health: publicProcedure
		.meta({
			openapi: {
				summary: "Health check",
				description:
					"Verify the application is running and the database connection is healthy by executing a simple query.",
			},
		})
		.query(async () => {
			try {
				await db.execute(sql`SELECT 1`);
				return { status: "ok" };
			} catch (error) {
				console.error("Database connection error:", error);
				throw error;
			}
		}),
	checkInfrastructureHealth: adminProcedure
		.meta({
			openapi: {
				summary: "Check infrastructure health",
				description:
					"Check the health status of PostgreSQL, Redis, and Traefik services. Returns healthy for all on cloud.",
			},
		})
		.query(async () => {
			if (IS_CLOUD) {
				return {
					postgres: { status: "healthy" as const },
					redis: { status: "healthy" as const },
					traefik: { status: "healthy" as const },
				};
			}

			const [postgres, redis, traefik] = await Promise.all([
				checkPostgresHealth(),
				checkRedisHealth(),
				checkTraefikHealth(),
			]);

			return { postgres, redis, traefik };
		}),
	setupGPU: adminProcedure
		.meta({
			openapi: {
				summary: "Set up GPU support",
				description:
					"Install and configure GPU support (NVIDIA runtime) on the host or a specified server. On cloud, a serverId is required.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD && !input.serverId) {
				throw new Error("Select a server to enable the GPU Setup");
			}

			try {
				await setupGPUSupport(input.serverId);
				await audit(ctx, {
					action: "update",
					resourceType: "settings",
					resourceName: "setup-gpu",
				});
				return { success: true };
			} catch (error) {
				console.error("GPU Setup Error:", error);
				throw error;
			}
		}),
	checkGPUStatus: adminProcedure
		.meta({
			openapi: {
				summary: "Check GPU status",
				description:
					"Retrieve detailed GPU status including driver version, CUDA support, memory info, available GPUs, and Docker Swarm GPU resources for the host or a specified server.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			if (IS_CLOUD && !input.serverId) {
				return {
					driverInstalled: false,
					driverVersion: undefined,
					gpuModel: undefined,
					runtimeInstalled: false,
					runtimeConfigured: false,
					cudaSupport: undefined,
					cudaVersion: undefined,
					memoryInfo: undefined,
					availableGPUs: 0,
					swarmEnabled: false,
					gpuResources: 0,
				};
			}

			try {
				return await checkGPUStatus(input.serverId || "");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to check GPU status";
				throw new TRPCError({
					code: "BAD_REQUEST",
					message,
				});
			}
		}),
	updateTraefikPorts: adminProcedure
		.meta({
			openapi: {
				summary: "Update Traefik ports",
				description:
					"Replace the Traefik service port mappings with the provided list. Checks for port conflicts before applying. Runs the Traefik setup in the background.",
			},
		})
		.input(
			z.object({
				serverId: z.string().optional(),
				additionalPorts: z.array(
					z.object({
						targetPort: z.number(),
						publishedPort: z.number(),
						protocol: z.enum(["tcp", "udp", "sctp"]),
					}),
				),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Please set a serverId to update Traefik ports",
					});
				}
				const env = await readEnvironmentVariables(
					"dokploy-traefik",
					input?.serverId,
				);

				for (const port of input.additionalPorts) {
					const portCheck = await checkPortInUse(
						port.publishedPort,
						input.serverId,
					);
					if (portCheck.isInUse) {
						throw new TRPCError({
							code: "CONFLICT",
							message: `Port ${port.targetPort} is already in use by ${portCheck.conflictingContainer}`,
						});
					}
				}
				const preparedEnv = prepareEnvironmentVariables(env);

				// Run in background so the request returns immediately; client polls /api/health.
				void writeTraefikSetup({
					env: preparedEnv,
					additionalPorts: input.additionalPorts,
					serverId: input.serverId,
				}).catch((err) => {
					console.error(
						"updateTraefikPorts background writeTraefikSetup:",
						err,
					);
				});
				await audit(ctx, {
					action: "update",
					resourceType: "settings",
					resourceName: "traefik-ports",
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error updating Traefik ports",
					cause: error,
				});
			}
		}),
	getTraefikPorts: adminProcedure
		.meta({
			openapi: {
				summary: "Get Traefik ports",
				description:
					"Retrieve the current port mappings configured for the Dokploy Traefik service.",
			},
		})
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports;
		}),
	updateLogCleanup: protectedProcedure
		.meta({
			openapi: {
				summary: "Update log cleanup schedule",
				description:
					"Start or stop the automatic log cleanup cron job. Provide a cron expression to start, or null to stop. Disabled on cloud.",
			},
		})
		.input(
			z.object({
				cronExpression: z.string().nullable(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			let result: boolean;
			if (input.cronExpression) {
				result = await startLogCleanup(input.cronExpression);
			} else {
				result = await stopLogCleanup();
			}
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "log-cleanup",
			});
			return result;
		}),

	getLogCleanupStatus: protectedProcedure
		.meta({
			openapi: {
				summary: "Get log cleanup status",
				description:
					"Return the current status and schedule of the automatic log cleanup job.",
			},
		})
		.query(async () => {
			return getLogCleanupStatus();
		}),

	getDokployCloudIps: adminProcedure
		.meta({
			openapi: {
				summary: "Get Dokploy cloud IP addresses",
				description:
					"Return the list of Dokploy cloud IP addresses from the environment configuration. Returns an empty array in self-hosted mode.",
			},
		})
		.query(async () => {
			if (!IS_CLOUD) {
				return [];
			}
			const ips = process.env.DOKPLOY_CLOUD_IPS?.split(",");
			return ips;
		}),
});
