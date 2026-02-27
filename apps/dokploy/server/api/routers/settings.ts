import {
	CLEANUP_CRON_JOB,
	canAccessToTraefikFiles,
	checkGPUStatus,
	checkPortInUse,
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
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { parse, stringify } from "yaml";
import { z } from "zod";
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
	getWebServerSettings: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		const settings = await getWebServerSettings();
		return settings;
	}),
	reloadServer: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await reloadDockerResource("dokploy", undefined, packageInfo.version);
		return true;
	}),
	cleanRedis: adminProcedure.mutation(async () => {
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
		return true;
	}),
	reloadRedis: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await reloadDockerResource("dokploy-redis");

		return true;
	}),
	cleanAllDeploymentQueue: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		return cleanAllDeploymentQueue();
	}),
	reloadTraefik: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			// Run in background so the request returns immediately; avoids proxy timeouts.
			void reloadDockerResource("dokploy-traefik", input?.serverId).catch(
				(err) => {
					console.error("reloadTraefik background:", err);
				},
			);
			return true;
		}),
	toggleDashboard: adminProcedure
		.input(apiEnableDashboard)
		.mutation(async ({ input }) => {
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
					const conflictingContainer = portCheck.conflictingContainer
						? ` by container "${portCheck.conflictingContainer}"`
						: "";
					throw new TRPCError({
						code: "CONFLICT",
						message: `Port 8080 is already in use${conflictingContainer}. Please stop the conflicting service or use a different port for the Traefik dashboard.`,
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
			return true;
		}),
	cleanUnusedImages: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanupImages(input?.serverId);
			return true;
		}),
	cleanUnusedVolumes: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanupVolumes(input?.serverId);
			return true;
		}),
	cleanStoppedContainers: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanupContainers(input?.serverId);
			return true;
		}),
	cleanDockerBuilder: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanupBuilders(input?.serverId);
		}),
	cleanDockerPrune: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanupSystem(input?.serverId);
			await cleanupBuilders(input?.serverId);

			return true;
		}),
	cleanAll: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			// Execute cleanup in background and return immediately to avoid gateway timeouts
			const result = await cleanupAllBackground(input?.serverId);

			return result;
		}),
	cleanMonitoring: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		const { MONITORING_PATH } = paths();
		await recreateDirectory(MONITORING_PATH);
		return true;
	}),
	saveSSHPrivateKey: adminProcedure
		.input(apiSaveSSHKey)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			await updateWebServerSettings({
				sshPrivateKey: input.sshPrivateKey,
			});

			return true;
		}),
	assignDomainServer: adminProcedure
		.input(apiAssignDomain)
		.mutation(async ({ input }) => {
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

			return settings;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await updateWebServerSettings({
			sshPrivateKey: null,
		});
		return true;
	}),
	updateDockerCleanup: adminProcedure
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

			return true;
		}),

	readTraefikConfig: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return true;
		}
		const traefikConfig = readMainConfig();
		return traefikConfig;
	}),

	updateTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeMainConfig(input.traefikConfig);
			return true;
		}),

	readWebServerTraefikConfig: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return true;
		}
		const traefikConfig = readConfig("dokploy");
		return traefikConfig;
	}),
	updateWebServerTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeConfig("dokploy", input.traefikConfig);
			return true;
		}),

	readMiddlewareTraefikConfig: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return true;
		}
		const traefikConfig = readConfig("middlewares");
		return traefikConfig;
	}),

	updateMiddlewareTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			writeConfig("middlewares", input.traefikConfig);
			return true;
		}),
	getUpdateData: protectedProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return DEFAULT_UPDATE_DATA;
		}

		return await getUpdateData(packageInfo.version);
	}),
	updateServer: adminProcedure.mutation(async () => {
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
		}

		return true;
	}),

	getDokployVersion: protectedProcedure.query(() => {
		return packageInfo.version;
	}),
	getReleaseTag: protectedProcedure.query(() => {
		return getDokployImageTag();
	}),
	readDirectories: protectedProcedure
		.input(apiServerSchema)
		.query(async ({ ctx, input }) => {
			try {
				if (ctx.user.role === "member") {
					const canAccess = await canAccessToTraefikFiles(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);

					if (!canAccess) {
						throw new TRPCError({ code: "UNAUTHORIZED" });
					}
				}
				const { MAIN_TRAEFIK_PATH } = paths(!!input?.serverId);
				const result = await readDirectory(MAIN_TRAEFIK_PATH, input?.serverId);
				return result || [];
			} catch (error) {
				throw error;
			}
		}),

	updateTraefikFile: protectedProcedure
		.input(apiModifyTraefikConfig)
		.mutation(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				const canAccess = await canAccessToTraefikFiles(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			await writeTraefikConfigInPath(
				input.path,
				input.traefikConfig,
				input?.serverId,
			);
			return true;
		}),

	readTraefikFile: protectedProcedure
		.input(apiReadTraefikConfig)
		.query(async ({ input, ctx }) => {
			if (ctx.user.role === "member") {
				const canAccess = await canAccessToTraefikFiles(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			if (input.serverId) {
				const server = await findServerById(input.serverId);

				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}

			return readConfigInPath(input.path, input.serverId);
		}),
	getIp: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return "";
		}
		const settings = await getWebServerSettings();
		return settings?.serverIp || "";
	}),
	updateServerIp: adminProcedure
		.input(
			z.object({
				serverIp: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			const settings = await updateWebServerSettings({
				serverIp: input.serverIp,
			});
			return settings;
		}),

	getOpenApiDocument: protectedProcedure.query(
		async ({ ctx }): Promise<unknown> => {
			const protocol = ctx.req.headers["x-forwarded-proto"];
			const url = `${protocol}://${ctx.req.headers.host}/api/trpc`;
			const openApiDocument = generateOpenApiDocument(appRouter, {
				title: "tRPC OpenAPI",
				version: packageInfo.version,
				baseUrl: url,
				docsUrl: `${url}/trpc/settings.getOpenApiDocument`,
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
					"mariadb",
					"sshRouter",
					"gitProvider",
					"bitbucket",
					"ai",
					"github",
					"gitlab",
					"gitea",
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
		},
	),
	readTraefikEnv: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const envVars = await readEnvironmentVariables(
				"dokploy-traefik",
				input?.serverId,
			);
			return envVars;
		}),

	writeTraefikEnv: adminProcedure
		.input(z.object({ env: z.string(), serverId: z.string().optional() }))
		.mutation(async ({ input }) => {
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
			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure
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
	haveActivateRequests: protectedProcedure.query(async () => {
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
		.input(
			z.object({
				enable: z.boolean(),
			}),
		)
		.mutation(async ({ input }) => {
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

			return true;
		}),
	isCloud: publicProcedure.query(async () => {
		return IS_CLOUD;
	}),
	isUserSubscribed: protectedProcedure.query(async ({ ctx }) => {
		const haveServers = await db.query.server.findMany({
			where: eq(server.organizationId, ctx.session?.activeOrganizationId || ""),
		});
		const haveProjects = await db.query.projects.findMany({
			where: eq(
				projects.organizationId,
				ctx.session?.activeOrganizationId || "",
			),
		});
		return haveServers.length > 0 || haveProjects.length > 0;
	}),
	health: publicProcedure.query(async () => {
		try {
			await db.execute(sql`SELECT 1`);
			return { status: "ok" };
		} catch (error) {
			console.error("Database connection error:", error);
			throw error;
		}
	}),
	setupGPU: adminProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD && !input.serverId) {
				throw new Error("Select a server to enable the GPU Setup");
			}

			try {
				await setupGPUSupport(input.serverId);
				return { success: true };
			} catch (error) {
				console.error("GPU Setup Error:", error);
				throw error;
			}
		}),
	checkGPUStatus: adminProcedure
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
		.mutation(async ({ input }) => {
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
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports;
		}),
	updateLogCleanup: protectedProcedure
		.input(
			z.object({
				cronExpression: z.string().nullable(),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			if (input.cronExpression) {
				return startLogCleanup(input.cronExpression);
			}
			return stopLogCleanup();
		}),

	getLogCleanupStatus: protectedProcedure.query(async () => {
		return getLogCleanupStatus();
	}),

	getDokployCloudIps: adminProcedure.query(async () => {
		if (!IS_CLOUD) {
			return [];
		}
		const ips = process.env.DOKPLOY_CLOUD_IPS?.split(",");
		return ips;
	}),
});
