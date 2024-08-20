import { MAIN_TRAEFIK_PATH, MONITORING_PATH, docker } from "@/server/constants";
import {
	apiAssignDomain,
	apiEnableDashboard,
	apiModifyTraefikConfig,
	apiReadTraefikConfig,
	apiSaveSSHKey,
	apiTraefikConfig,
	apiUpdateDockerCleanup,
} from "@/server/db/schema";
import { initializeTraefik } from "@/server/setup/traefik-setup";
import {
	cleanStoppedContainers,
	cleanUpDockerBuilder,
	cleanUpSystemPrune,
	cleanUpUnusedImages,
	cleanUpUnusedVolumes,
	prepareEnvironmentVariables,
	startService,
	stopService,
} from "@/server/utils/docker/utils";
import { recreateDirectory } from "@/server/utils/filesystem/directory";
import { sendDockerCleanupNotifications } from "@/server/utils/notifications/docker-cleanup";
import { execAsync } from "@/server/utils/process/execAsync";
import { spawnAsync } from "@/server/utils/process/spawnAsync";
import {
	readConfig,
	readConfigInPath,
	readMonitoringConfig,
	writeConfig,
	writeTraefikConfigInPath,
} from "@/server/utils/traefik/application";
import {
	readMainConfig,
	updateLetsEncryptEmail,
	updateServerTraefik,
	writeMainConfig,
} from "@/server/utils/traefik/web-server";
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
import { scheduleJob, scheduledJobs } from "node-schedule";
import { z } from "zod";
import { appRouter } from "../root";
import { findAdmin, updateAdmin } from "../services/admin";
import {
	getDokployImage,
	getDokployVersion,
	pullLatestRelease,
	readDirectory,
} from "../services/settings";
import { canAccessToTraefikFiles } from "../services/user";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

export const settingsRouter = createTRPCRouter({
	reloadServer: adminProcedure.mutation(async () => {
		const { stdout } = await execAsync(
			"docker service inspect dokploy --format '{{.ID}}'",
		);
		await execAsync(`docker service update --force ${stdout.trim()}`);
		return true;
	}),
	reloadTraefik: adminProcedure.mutation(async () => {
		try {
			await stopService("dokploy-traefik");
			await startService("dokploy-traefik");
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
			});
			return true;
		}),

	cleanUnusedImages: adminProcedure.mutation(async () => {
		await cleanUpUnusedImages();
		return true;
	}),
	cleanUnusedVolumes: adminProcedure.mutation(async () => {
		await cleanUpUnusedVolumes();
		return true;
	}),
	cleanStoppedContainers: adminProcedure.mutation(async () => {
		await cleanStoppedContainers();
		return true;
	}),
	cleanDockerBuilder: adminProcedure.mutation(async () => {
		await cleanUpDockerBuilder();
	}),
	cleanDockerPrune: adminProcedure.mutation(async () => {
		await cleanUpSystemPrune();
		await cleanUpDockerBuilder();

		return true;
	}),
	cleanAll: adminProcedure.mutation(async () => {
		await cleanUpUnusedImages();
		await cleanUpDockerBuilder();
		await cleanUpSystemPrune();

		return true;
	}),
	cleanMonitoring: adminProcedure.mutation(async () => {
		await recreateDirectory(MONITORING_PATH);
		return true;
	}),
	saveSSHPrivateKey: adminProcedure
		.input(apiSaveSSHKey)
		.mutation(async ({ input, ctx }) => {
			await updateAdmin(ctx.user.authId, {
				sshPrivateKey: input.sshPrivateKey,
			});

			return true;
		}),
	assignDomainServer: adminProcedure
		.input(apiAssignDomain)
		.mutation(async ({ ctx, input }) => {
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
		await updateAdmin(ctx.user.authId, {
			sshPrivateKey: null,
		});
		return true;
	}),
	updateDockerCleanup: adminProcedure
		.input(apiUpdateDockerCleanup)
		.mutation(async ({ input, ctx }) => {
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

			return true;
		}),

	readTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readMainConfig();
		return traefikConfig;
	}),

	updateTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeMainConfig(input.traefikConfig);
			return true;
		}),

	readWebServerTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readConfig("dokploy");
		return traefikConfig;
	}),
	updateWebServerTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeConfig("dokploy", input.traefikConfig);
			return true;
		}),

	readMiddlewareTraefikConfig: adminProcedure.query(() => {
		const traefikConfig = readConfig("middlewares");
		return traefikConfig;
	}),

	updateMiddlewareTraefikConfig: adminProcedure
		.input(apiTraefikConfig)
		.mutation(async ({ input }) => {
			writeConfig("middlewares", input.traefikConfig);
			return true;
		}),

	checkAndUpdateImage: adminProcedure.mutation(async () => {
		return await pullLatestRelease();
	}),
	updateServer: adminProcedure.mutation(async () => {
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
		return getDokployVersion();
	}),
	readDirectories: protectedProcedure.query(async ({ ctx }) => {
		if (ctx.user.rol === "user") {
			const canAccess = await canAccessToTraefikFiles(ctx.user.authId);

			if (!canAccess) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
		}
		const result = readDirectory(MAIN_TRAEFIK_PATH);
		return result || [];
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
			writeTraefikConfigInPath(input.path, input.traefikConfig);
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
			return readConfigInPath(input.path);
		}),
	getIp: protectedProcedure.query(async () => {
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
				],
			});

			openApiDocument.info = {
				title: "Dokploy API",
				description: "Endpoints for dokploy",
				version: getDokployVersion(),
			};

			return openApiDocument;
		},
	),
	readTraefikEnv: adminProcedure.query(async () => {
		const { stdout } = await execAsync(
			"docker service inspect --format='{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' dokploy-traefik",
		);

		return stdout.trim();
	}),

	writeTraefikEnv: adminProcedure
		.input(z.string())
		.mutation(async ({ input }) => {
			const envs = prepareEnvironmentVariables(input);
			await initializeTraefik({
				env: envs,
			});

			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure.query(async () => {
		const { stdout } = await execAsync(
			"docker service inspect --format='{{json .Endpoint.Ports}}' dokploy-traefik",
		);

		const parsed: any[] = JSON.parse(stdout.trim());

		for (const port of parsed) {
			if (port.PublishedPort === 8080) {
				return true;
			}
		}

		return false;
	}),

	readMonitoringConfig: adminProcedure.query(() => {
		const rawConfig = readMonitoringConfig();
		const parsedConfig = parseRawConfig(rawConfig as string);
		const processedLogs = processLogs(rawConfig as string);
		return {
			data: parsedConfig,
			hourlyData: processedLogs,
		};
	}),
});
interface LogEntry {
	StartUTC: string;
	// Otros campos relevantes...
}

interface HourlyData {
	hour: string;
	count: number;
}

function processLogs(logString: string): HourlyData[] {
	const hourlyData: Record<string, number> = {};

	const logEntries = logString.trim().split("\n");

	for (const entry of logEntries) {
		try {
			const log: LogEntry = JSON.parse(entry);
			const date = new Date(log.StartUTC);
			const hourKey = `${date.toISOString().slice(0, 13)}:00:00Z`; // Agrupa por hora

			hourlyData[hourKey] = (hourlyData[hourKey] || 0) + 1;
		} catch (error) {
			console.error("Error parsing log entry:", error);
		}
	}

	return Object.entries(hourlyData)
		.map(([hour, count]) => ({ hour, count }))
		.sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
}

interface LogEntry {
	ClientAddr: string;
	ClientHost: string;
	ClientPort: string;
	ClientUsername: string;
	DownstreamContentSize: number;
	DownstreamStatus: number;
	Duration: number;
	OriginContentSize: number;
	OriginDuration: number;
	OriginStatus: number;
	Overhead: number;
	RequestAddr: string;
	RequestContentSize: number;
	RequestCount: number;
	RequestHost: string;
	RequestMethod: string;
	RequestPath: string;
	RequestPort: string;
	RequestProtocol: string;
	RequestScheme: string;
	RetryAttempts: number;
	RouterName: string;
	ServiceAddr: string;
	ServiceName: string;
	ServiceURL: {
		Scheme: string;
		Opaque: string;
		User: null;
		Host: string;
		Path: string;
		RawPath: string;
		ForceQuery: boolean;
		RawQuery: string;
		Fragment: string;
		RawFragment: string;
	};
	StartLocal: string;
	StartUTC: string;
	downstream_Content_Type: string;
	entryPointName: string;
	level: string;
	msg: string;
	origin_Content_Type: string;
	request_Content_Type: string;
	request_User_Agent: string;
	time: string;
}

function parseRawConfig(rawConfig: string): LogEntry[] {
	try {
		// Dividir el string en líneas y filtrar las líneas vacías
		const jsonLines = rawConfig
			.split("\n")
			.filter((line) => line.trim() !== "");

		// Parsear cada línea como un objeto JSON
		const parsedConfig = jsonLines.map((line) => JSON.parse(line) as LogEntry);

		return parsedConfig;
	} catch (error) {
		console.error("Error parsing rawConfig:", error);
		throw new Error("Failed to parse rawConfig");
	}
}
