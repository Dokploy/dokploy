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
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { dump, load } from "js-yaml";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { z } from "zod";
import { appRouter } from "../root";
import {
	paths,
	logRotationManager,
	parseRawConfig,
	processLogs,
	initializeTraefik,
	cleanStoppedContainers,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	cleanUpUnusedVolumes,
	prepareEnvironmentVariables,
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
	recreateDirectory,
	sendDockerCleanupNotifications,
	execAsync,
	execAsyncRemote,
	spawnAsync,
	readConfig,
	readConfigInPath,
	readMonitoringConfig,
	writeConfig,
	writeTraefikConfigInPath,
	readMainConfig,
	updateLetsEncryptEmail,
	updateServerTraefik,
	writeMainConfig,
	findAdmin,
	updateAdmin,
	findServerById,
	updateServerById,
	canAccessToTraefikFiles,
	getDokployImage,
	pullLatestRelease,
	readDirectory,
	IS_CLOUD,
} from "@dokploy/builders";
import packageInfo from "../../../package.json";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

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
			await updateAdmin(ctx.user.authId, {
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
			const admin = await updateAdmin(ctx.user.authId, {
				host: input.host,
				letsEncryptEmail: input.letsEncryptEmail,
				certificateType: input.certificateType,
			});

			if (!admin) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Admin not found",
				});
			}

			updateServerTraefik(admin, input.host);
			updateLetsEncryptEmail(admin.letsEncryptEmail);
			return admin;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async ({ ctx }) => {
		if (IS_CLOUD) {
			return true;
		}
		await updateAdmin(ctx.user.authId, {
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
				if (server.enableDockerCleanup) {
					scheduleJob("docker-cleanup", "0 0 * * *", async () => {
						console.log(
							`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
						);
						await cleanUpUnusedImages(server.serverId);
						await cleanUpDockerBuilder(server.serverId);
						await cleanUpSystemPrune(server.serverId);
						await sendDockerCleanupNotifications();
					});
				}
			} else if (!IS_CLOUD) {
				await updateAdmin(ctx.user.authId, {
					enableDockerCleanup: input.enableDockerCleanup,
				});
				const admin = await findAdmin();

				if (admin.enableDockerCleanup) {
					scheduleJob("docker-cleanup", "0 0 * * *", async () => {
						console.log(
							`Docker Cleanup ${new Date().toLocaleString()}] Running...`,
						);
						await cleanUpUnusedImages();
						await cleanUpDockerBuilder();
						await cleanUpSystemPrune();
						await sendDockerCleanupNotifications();
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

	checkAndUpdateImage: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		return await pullLatestRelease();
	}),
	updateServer: adminProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return true;
		}
		await spawnAsync("docker", [
			"service",
			"update",
			"--force",
			"--image",
			getDokployImage(),
			"dokploy",
		]);
		return true;
	}),

	getDokployVersion: adminProcedure.query(() => {
		return packageInfo.version;
	}),
	readDirectories: protectedProcedure
		.input(apiServerSchema)
		.query(async ({ ctx, input }) => {
			try {
				if (ctx.user.rol === "user") {
					const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

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
			if (ctx.user.rol === "user") {
				const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

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
			if (ctx.user.rol === "user") {
				const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

				if (!canAccess) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return readConfigInPath(input.path, input.serverId);
		}),
	getIp: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return true;
		}
		const admin = await findAdmin();
		return admin.serverIp;
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
				// TODO: get version from package.json
				version: "1.0.0",
			};

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
			} else {
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
		.query(({ input }) => {
			if (IS_CLOUD) {
				return true;
			}
			const rawConfig = readMonitoringConfig();
			const parsedConfig = parseRawConfig(
				rawConfig as string,
				input.page,
				input.sort,
				input.search,
				input.status,
			);

			return parsedConfig;
		}),
	readStats: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return true;
		}
		const rawConfig = readMonitoringConfig();
		const processedLogs = processLogs(rawConfig as string);
		return processedLogs || [];
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
	isCloud: adminProcedure.query(async () => {
		return IS_CLOUD;
	}),
});
