import path from "node:path";
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
} from "@/server/db/schema";
import { removeJob, schedule } from "@/server/utils/backup";
import {
	DEFAULT_UPDATE_DATA,
	IS_CLOUD,
	calculateRequestsStatistics,
	canAccessToTraefikFiles,
	cleanStoppedContainers,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	cleanUpUnusedVolumes,
	execAsync,
	execAsyncRemote,
	findServerById,
	findUserById,
	getDokployImage,
	getDokployImageTag,
	getUpdateData,
	initializeTraefik,
	logRotationManager,
	parseLogs,
	paths,
	prepareEnvironmentVariables,
	pullLatestRelease,
	readConfig,
	readConfigInPath,
	readDirectory,
	readMainConfig,
	recreateDirectory,
	sendDockerCleanupNotifications,
	spawnAsync,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	updateLetsEncryptEmail,
	updateServerById,
	updateServerTraefik,
	updateUser,
	writeConfig,
	writeMainConfig,
	writeTraefikConfigInPath,
} from "@dokploy/server";
import { checkGPUStatus, setupGPUSupport } from "@dokploy/server";
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { dump, load } from "js-yaml";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { z } from "zod";
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
		const { stdout } = await execAsync(
			"docker service inspect dokploy --format '{{.ID}}'",
		);
		await execAsync(`docker service update --force ${stdout.trim()}`);
		return true;
	}),
	reloadTraefik: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input }) => {
			try {
				if (input?.serverId) {
					await stopServiceRemote(input.serverId, "dokploy-traefik");
					await startServiceRemote(input.serverId, "dokploy-traefik");
				} else if (!IS_CLOUD) {
					await stopService("dokploy-traefik");
					await startService("dokploy-traefik");
				}
			} catch (err) {
				console.error(err);
			}

			return true;
		}),
	toggleDashboard: adminProcedure
		.input(apiEnableDashboard)
		.mutation(async ({ input }) => {
			await initializeTraefik({
				enableDashboard: input.enableDashboard,
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
				if (ctx.user.rol === "member") {
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
			if (ctx.user.rol === "member") {
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
			if (ctx.user.rol === "member") {
				const canAccess = await canAccessToTraefikFiles(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

				if (!canAccess) {
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
			const command =
				"docker service inspect --format='{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' dokploy-traefik";

			if (input?.serverId) {
				const result = await execAsyncRemote(input.serverId, command);
				return result.stdout.trim();
			}
			if (!IS_CLOUD) {
				const result = await execAsync(command);
				return result.stdout.trim();
			}
		}),

	writeTraefikEnv: adminProcedure
		.input(z.object({ env: z.string(), serverId: z.string().optional() }))
		.mutation(async ({ input }) => {
			const envs = prepareEnvironmentVariables(input.env);
			await initializeTraefik({
				env: envs,
				serverId: input.serverId,
			});

			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const command = `docker service inspect --format='{{json .Endpoint.Ports}}' dokploy-traefik`;

			let stdout = "";
			if (input?.serverId) {
				const result = await execAsyncRemote(input.serverId, command);
				stdout = result.stdout;
			} else if (!IS_CLOUD) {
				const result = await execAsync(
					"docker service inspect --format='{{json .Endpoint.Ports}}' dokploy-traefik",
				);
				stdout = result.stdout;
			}

			const parsed: any[] = JSON.parse(stdout.trim());
			for (const port of parsed) {
				if (port.PublishedPort === 8080) {
					return true;
				}
			}

			return false;
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
			const { DYNAMIC_TRAEFIK_PATH } = paths();
			return await parseLogs(
				path.join(DYNAMIC_TRAEFIK_PATH, "access.log"),
				input.page,
				input.sort,
				input.search,
				input.status,
			);
		}),
	readStats: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return [];
		}
		const { DYNAMIC_TRAEFIK_PATH } = paths();
		return calculateRequestsStatistics(
			path.join(DYNAMIC_TRAEFIK_PATH, "access.log"),
		);
	}),
	getLogRotateStatus: adminProcedure.query(async () => {
		if (IS_CLOUD) {
			return true;
		}
		return await logRotationManager.getStatus();
	}),
	toggleLogRotate: adminProcedure
		.input(
			z.object({
				enable: z.boolean(),
			}),
		)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			if (input.enable) {
				await logRotationManager.activate();
			} else {
				await logRotationManager.deactivate();
			}

			return true;
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
						publishMode: z.enum(["ingress", "host"]).default("host"),
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
				await initializeTraefik({
					serverId: input.serverId,
					additionalPorts: input.additionalPorts,
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
			const command = `docker service inspect --format='{{json .Endpoint.Ports}}' dokploy-traefik`;

			try {
				let stdout = "";
				if (input?.serverId) {
					const result = await execAsyncRemote(input.serverId, command);
					stdout = result.stdout;
				} else if (!IS_CLOUD) {
					const result = await execAsync(command);
					stdout = result.stdout;
				}

				const ports: {
					Protocol: string;
					TargetPort: number;
					PublishedPort: number;
					PublishMode: string;
				}[] = JSON.parse(stdout.trim());

				// Filter out the default ports (80, 443, and optionally 8080)
				const additionalPorts = ports
					.filter((port) => ![80, 443, 8080].includes(port.PublishedPort))
					.map((port) => ({
						targetPort: port.TargetPort,
						publishedPort: port.PublishedPort,
						publishMode: port.PublishMode.toLowerCase() as "host" | "ingress",
					}));

				return additionalPorts;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get Traefik ports",
					cause: error,
				});
			}
		}),
});
// {
// 	"Parallelism": 1,
// 	"Delay": 10000000000,
// 	"FailureAction": "rollback",
// 	"Order": "start-first"
//   }
