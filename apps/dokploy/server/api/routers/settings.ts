import {
	canAccessToTraefikFiles,
	checkGPUStatus,
	cleanStoppedContainers,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	cleanUpUnusedVolumes,
	DEFAULT_UPDATE_DATA,
	execAsync,
	findServerById,
	findUserById,
	getDokployImage,
	getDokployImageTag,
	getLogCleanupStatus,
	getUpdateData,
	IS_CLOUD,
	parseRawConfig,
	paths,
	prepareEnvironmentVariables,
	processLogs,
	pullLatestRelease,
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
	updateUser,
	writeConfig,
	writeMainConfig,
	writeTraefikConfigInPath,
	writeTraefikSetup,
} from "@dokploy/server";
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { dump, load } from "js-yaml";
import { scheduledJobs, scheduleJob } from "node-schedule";
import { z } from "zod";
import { db } from "@/server/db";
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
	reloadServer: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await reloadDockerResource("dokploy");
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
	reloadTraefik: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			try {
				await reloadDockerResource("dokploy-traefik", input?.serverId);
			} catch (err) {
				console.error(err);
			}

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
				newPorts.push({
					targetPort: 8080,
					publishedPort: 8080,
					protocol: "tcp",
				});
			} else {
				newPorts = ports.filter((port) => port.targetPort !== 8080);
			}

			await writeTraefikSetup({
				env: preparedEnv,
				additionalPorts: newPorts,
				serverId: input.serverId,
			});
			return true;
		}),
	cleanUnusedImages: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanUpUnusedImages(input?.serverId);
			return true;
		}),
	cleanUnusedVolumes: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanUpUnusedVolumes(input?.serverId);
			return true;
		}),
	cleanStoppedContainers: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanStoppedContainers(input?.serverId);
			return true;
		}),
	cleanDockerBuilder: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanUpDockerBuilder(input?.serverId);
		}),
	cleanDockerPrune: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanUpSystemPrune(input?.serverId);
			await cleanUpDockerBuilder(input?.serverId);

			return true;
		}),
	cleanAll: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			await cleanUpUnusedImages(input?.serverId);
			await cleanStoppedContainers(input?.serverId);
			await cleanUpDockerBuilder(input?.serverId);
			await cleanUpSystemPrune(input?.serverId);

			return true;
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
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			await updateUser(ctx.user.id, {
				sshPrivateKey: input.sshPrivateKey,
			});

			return true;
		}),
	assignDomainServer: adminProcedure
		.input(apiAssignDomain)
		.mutation(async ({ ctx, input }) => {
			if (IS_CLOUD) {
				return true;
			}
			const user = await updateUser(ctx.user.id, {
				host: input.host,
				...(input.letsEncryptEmail && {
					letsEncryptEmail: input.letsEncryptEmail,
				}),
				certificateType: input.certificateType,
				https: input.https,
			});

			if (!user) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "User not found",
				});
			}

			updateServerTraefik(user, input.host);
			if (input.letsEncryptEmail) {
				updateLetsEncryptEmail(input.letsEncryptEmail);
			}

			return user;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async ({ ctx }) => {
		if (IS_CLOUD) {
			return true;
		}
		await updateUser(ctx.user.id, {
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
							cronSchedule: "0 0 * * *",
							serverId: input.serverId,
							type: "server",
						});
					} else {
						scheduleJob(server.serverId, "0 0 * * *", async () => {
							console.log(
								`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
							);
							await cleanUpUnusedImages(server.serverId);
							await cleanUpDockerBuilder(server.serverId);
							await cleanUpSystemPrune(server.serverId);
							await sendDockerCleanupNotifications(server.organizationId);
						});
					}
				} else {
					if (IS_CLOUD) {
						await removeJob({
							cronSchedule: "0 0 * * *",
							serverId: input.serverId,
							type: "server",
						});
					} else {
						const currentJob = scheduledJobs[server.serverId];
						currentJob?.cancel();
					}
				}
			} else if (!IS_CLOUD) {
				const userUpdated = await updateUser(ctx.user.id, {
					enableDockerCleanup: input.enableDockerCleanup,
				});

				if (userUpdated?.enableDockerCleanup) {
					scheduleJob("docker-cleanup", "0 0 * * *", async () => {
						console.log(
							`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
						);
						await cleanUpUnusedImages();
						await cleanUpDockerBuilder();
						await cleanUpSystemPrune();
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

		return await getUpdateData();
	}),
	updateServer: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}

		await pullLatestRelease();

		// This causes restart of dokploy, thus it will not finish executing properly, so don't await it
		// Status after restart is checked via frontend /api/health endpoint
		void spawnAsync("docker", [
			"service",
			"update",
			"--force",
			"--image",
			getDokployImage(),
			"dokploy",
		]);

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
	getIp: protectedProcedure.query(async ({ ctx }) => {
		if (IS_CLOUD) {
			return true;
		}
		const user = await findUserById(ctx.user.ownerId);
		return user.serverIp;
	}),

	getOpenApiDocument: protectedProcedure.query(
		async ({ ctx }): Promise<unknown> => {
			const protocol = ctx.req.headers["x-forwarded-proto"];
			const url = `${protocol}://${ctx.req.headers.host}/api`;
			const openApiDocument = generateOpenApiDocument(appRouter, {
				title: "tRPC OpenAPI",
				version: "1.0.0",
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
					"mariadb",
					"sshRouter",
					"gitProvider",
					"bitbucket",
					"github",
					"gitlab",
					"gitea",
				],
			});

			openApiDocument.info = {
				title: "Dokploy API",
				description: "Endpoints for dokploy",
				version: "1.0.0",
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

			await writeTraefikSetup({
				env: envs,
				additionalPorts: ports,
				serverId: input.serverId,
			});

			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports.some((port) => port.targetPort === 8080);
		}),

	readStatsLogs: adminProcedure
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
	haveActivateRequests: adminProcedure.query(async () => {
		if (IS_CLOUD) {
			return true;
		}
		const config = readMainConfig();

		if (!config) return false;
		const parsedConfig = load(config) as {
			accessLog?: {
				filePath: string;
			};
		};

		return !!parsedConfig?.accessLog?.filePath;
	}),
	toggleRequests: adminProcedure
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

			const currentConfig = load(mainConfig) as {
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
						filters: {
							retryAttempts: true,
							minDuration: "10ms",
						},
					},
				};
				currentConfig.accessLog = config.accessLog;
			} else {
				currentConfig.accessLog = undefined;
			}

			writeMainConfig(dump(currentConfig));

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
		if (IS_CLOUD) {
			try {
				await db.execute(sql`SELECT 1`);
				return { status: "ok" };
			} catch (error) {
				console.error("Database connection error:", error);
				throw error;
			}
		}
		return { status: "not_cloud" };
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
				const preparedEnv = prepareEnvironmentVariables(env);

				await writeTraefikSetup({
					env: preparedEnv,
					additionalPorts: input.additionalPorts,
					serverId: input.serverId,
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
	updateLogCleanup: adminProcedure
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

	getLogCleanupStatus: adminProcedure.query(async () => {
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
