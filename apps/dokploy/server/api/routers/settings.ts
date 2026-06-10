import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import {
	ACCESS_LOG_RETAINED_LINES,
	applyCaddyMigration as applyCaddyMigrationCutover,
	CLEANUP_CRON_JOB,
	checkGPUStatus,
	checkPortInUse,
	checkPostgresHealth,
	checkRedisHealth,
	checkWebServerHealth,
	cleanupAll,
	cleanupAllBackground,
	cleanupBuilders,
	cleanupContainers,
	cleanupImages,
	cleanupSystem,
	cleanupVolumes,
	compileWriteAndReloadCaddyConfigSafely,
	compileWriteAndValidateCaddyConfigSafely,
	DEFAULT_UPDATE_DATA,
	execAsync,
	findServerById,
	getCaddyCompileSettings,
	getCaddyTrustedProxySettings,
	getDockerDiskUsage,
	getDokployImageTag,
	getLogCleanupStatus,
	getUpdateData,
	getWebServerPaths,
	getWebServerResourceName,
	getWebServerSettings,
	IS_CLOUD,
	isCaddyReservedAdditionalPort,
	parseRawConfig,
	paths,
	prepareCaddyMigration as prepareCaddyMigrationDryRun,
	prepareEnvironmentVariables,
	processLogs,
	readCaddyConfigFileIfExists,
	getCaddyMigrationReport as readCaddyMigrationReport,
	readConfig,
	readConfigInPath,
	readDirectory,
	readEnvironmentVariables,
	readMainConfig,
	readMonitoringConfig,
	readPorts,
	recreateDirectory,
	reloadCaddyAfterValidation,
	reloadDockerResource,
	resolveWebServerProvider,
	rollbackCaddyMigration as rollbackCaddyMigrationCutover,
	sendDockerCleanupNotifications,
	setupGPUSupport,
	spawnAsync,
	startLogCleanup,
	stopLogCleanup,
	updateCaddyTrustedProxySettings,
	updateLetsEncryptEmail,
	updateLocalWebServerProvider,
	updateRemoteWebServerProvider,
	updateServerById,
	updateServerCaddy,
	updateServerTraefik,
	updateWebServerSettings,
	type WebServerProvider,
	writeConfig,
	writeMainConfig,
	writeTraefikConfigInPath,
	writeTraefikSetup,
	writeWebServerSetup,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { checkPermission } from "@dokploy/server/services/permission";
import { generateOpenApiDocument } from "@dokploy/trpc-openapi";
import { TRPCError } from "@trpc/server";
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
	enterpriseProcedure,
	protectedProcedure,
	publicProcedure,
} from "../trpc";

const webServerProviderSchema = z.enum(["traefik", "caddy"]);

const apiWebServerProvider = z.object({
	provider: webServerProviderSchema,
	serverId: z.string().optional(),
});

const apiWebServerConfig = z.object({
	webServerConfig: z.string().min(1),
	serverId: z.string().optional(),
});

const apiReadWebServerFile = z.object({
	path: z.string().min(1),
	serverId: z.string().optional(),
});

const apiModifyWebServerFile = apiReadWebServerFile.extend({
	webServerConfig: z.string().min(1),
});

const apiWriteWebServerEnv = z.object({
	env: z.string(),
	serverId: z.string().optional(),
});

const apiWebServerPorts = z.object({
	serverId: z.string().optional(),
	additionalPorts: z.array(
		z.object({
			targetPort: z.number(),
			publishedPort: z.number(),
			protocol: z.enum(["tcp", "udp", "sctp"]),
		}),
	),
});

const apiCaddyTrustedProxySettings = z.object({
	serverId: z.string().optional(),
	mode: z.enum(["disabled", "cloudflare", "static"]),
	ranges: z.array(z.string()).optional().nullable(),
	clientIpHeaders: z.array(z.string()).optional().nullable(),
	strict: z.boolean().optional().nullable(),
});

const apiCaddyMigration = z.object({
	serverId: z.string().optional(),
});

const apiCaddyMigrationById = apiCaddyMigration.extend({
	migrationId: z.string().min(1),
});

const apiApplyCaddyMigration = apiCaddyMigrationById.extend({
	confirmMaintenanceWindow: z.literal(true),
});

const ensureServerAccess = async (
	ctx: { session?: { activeOrganizationId?: string | null } | null },
	serverId?: string,
) => {
	if (!serverId) return;
	const remoteServer = await findServerById(serverId);
	if (remoteServer.organizationId !== ctx.session?.activeOrganizationId) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
};

const normalizeWebServerPath = (filePath: string) =>
	filePath.replace(/\\/g, "/").replace(/\/+$/g, "");

const isPathWithin = (targetPath: string, basePath: string) => {
	const normalizedTarget = normalizeWebServerPath(targetPath);
	const normalizedBase = normalizeWebServerPath(basePath);
	return (
		normalizedTarget === normalizedBase ||
		normalizedTarget.startsWith(`${normalizedBase}/`)
	);
};

const isCaddyMigrationBackupPath = (filePath: string, serverId?: string) => {
	const caddyPaths = paths(!!serverId);
	const normalizedPath = normalizeWebServerPath(filePath);
	const migrationsPath = normalizeWebServerPath(
		caddyPaths.CADDY_MIGRATIONS_PATH,
	);
	if (!isPathWithin(normalizedPath, migrationsPath)) {
		return false;
	}
	return normalizedPath
		.slice(migrationsPath.length)
		.split("/")
		.filter(Boolean)
		.includes("backups");
};

const assertCaddyReadableFilePath = (filePath: string, serverId?: string) => {
	const caddyPaths = paths(!!serverId);
	const normalizedPath = normalizeWebServerPath(filePath);
	if (isCaddyMigrationBackupPath(normalizedPath, serverId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Caddy migration backups may contain TLS or internal configuration and are not readable from the file editor.",
		});
	}
	if (
		normalizedPath === normalizeWebServerPath(caddyPaths.CADDY_CONFIG_PATH) ||
		isPathWithin(normalizedPath, caddyPaths.CADDY_FRAGMENTS_PATH) ||
		isPathWithin(normalizedPath, caddyPaths.CADDY_MIGRATIONS_PATH)
	) {
		return;
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message:
			"Caddy file access is limited to caddy.json, route fragments, and non-backup migration artifacts.",
	});
};

type WebServerDirectoryNode = {
	id: string;
	name: string;
	type: "file" | "directory";
	children?: WebServerDirectoryNode[];
};

const pruneCaddyBackupDirectoryNodes = (
	nodes: WebServerDirectoryNode[],
	serverId?: string,
): WebServerDirectoryNode[] =>
	nodes
		.filter((node) => !isCaddyMigrationBackupPath(node.id, serverId))
		.map((node) =>
			node.children
				? {
						...node,
						children: pruneCaddyBackupDirectoryNodes(node.children, serverId),
					}
				: node,
		);

const readCaddySafeDirectoryTree = async (serverId?: string) => {
	const caddyPaths = paths(!!serverId);
	const readOptionalDirectory = async (dirPath: string) => {
		try {
			return await readDirectory(dirPath, serverId);
		} catch (error) {
			if (
				error instanceof Error &&
				(error as NodeJS.ErrnoException).code === "ENOENT"
			) {
				return [];
			}
			throw error;
		}
	};
	return [
		{
			id: caddyPaths.CADDY_CONFIG_PATH,
			name: "caddy.json",
			type: "file" as const,
		},
		{
			id: caddyPaths.CADDY_FRAGMENTS_PATH,
			name: "fragments",
			type: "directory" as const,
			children: await readOptionalDirectory(caddyPaths.CADDY_FRAGMENTS_PATH),
		},
		{
			id: caddyPaths.CADDY_MIGRATIONS_PATH,
			name: "migrations",
			type: "directory" as const,
			children: pruneCaddyBackupDirectoryNodes(
				await readOptionalDirectory(caddyPaths.CADDY_MIGRATIONS_PATH),
				serverId,
			),
		},
	];
};

const resolveWebServerFilePath = (
	filePath: string,
	provider: WebServerProvider,
	serverId?: string,
) => {
	if (
		filePath.includes("../") ||
		filePath.includes("..\\") ||
		filePath.includes("\0") ||
		filePath.includes("\x00")
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid path: path traversal or null bytes are not allowed",
		});
	}

	const basePath = getWebServerPaths(provider, !!serverId).basePath;
	if (filePath.startsWith("/")) {
		if (filePath !== basePath && !filePath.startsWith(`${basePath}/`)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Invalid path: outside of active web server directory",
			});
		}
		return filePath;
	}

	return `${basePath}/${filePath.replace(/^\/+/, "")}`;
};

const getMainTraefikConfigPath = (serverId?: string) =>
	`${paths(!!serverId).MAIN_TRAEFIK_PATH}/traefik.yml`;

const readProviderMainConfig = async (
	provider: WebServerProvider,
	serverId?: string,
) => {
	if (provider === "caddy") {
		return readCaddyConfigFileIfExists({ serverId });
	}

	if (serverId) {
		return readConfigInPath(getMainTraefikConfigPath(serverId), serverId);
	}
	return readMainConfig();
};

const writeProviderMainConfig = async (
	provider: WebServerProvider,
	content: string,
	serverId?: string,
) => {
	if (provider === "caddy") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Caddy caddy.json is generated from route fragments and is read-only. Use Caddy migration/domain actions to update it.",
		});
	}

	if (serverId) {
		await writeTraefikConfigInPath(
			getMainTraefikConfigPath(serverId),
			content,
			serverId,
		);
		return;
	}
	writeMainConfig(content);
};

const reloadWebServerProvider = async (
	provider: WebServerProvider,
	serverId?: string,
) => {
	if (provider === "caddy") {
		await reloadCaddyAfterValidation(serverId);
		return;
	}
	await reloadDockerResource(getWebServerResourceName(provider), serverId);
};

const getCaddySetupOptions = async (
	provider: WebServerProvider,
	serverId?: string,
) => {
	if (provider !== "caddy") return {};
	return getCaddyCompileSettings(serverId);
};

const getLocalAccessLogPath = (provider: WebServerProvider) => {
	const currentPaths = paths();
	return provider === "caddy"
		? currentPaths.CADDY_ACCESS_LOG_PATH
		: `${currentPaths.DYNAMIC_TRAEFIK_PATH}/access.log`;
};

const readAccessLogFile = async (filePath: string) => {
	if (!existsSync(filePath)) {
		return "";
	}

	const recentLines: string[] = [];
	const fileStream = createReadStream(filePath, { encoding: "utf8" });
	const readline = createInterface({
		input: fileStream,
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	for await (const line of readline) {
		const trimmed = line.trim();
		if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
			recentLines.push(line);
			if (recentLines.length > ACCESS_LOG_RETAINED_LINES) {
				recentLines.shift();
			}
		}
	}
	return recentLines.length ? `${recentLines.join("\n")}\n` : "";
};

const readActiveRequestAccessLog = async (readAll = false) => {
	const provider = await resolveWebServerProvider();
	if (provider === "traefik") {
		return (await readMonitoringConfig(readAll)) ?? "";
	}
	return readAccessLogFile(getLocalAccessLogPath(provider));
};

const getRequestAnalyticsState = async () => {
	if (IS_CLOUD) {
		return {
			provider: "traefik" as const,
			enabled: true,
			reloadResourceName: "dokploy-traefik",
			accessLogPath: getLocalAccessLogPath("traefik"),
		};
	}

	const provider = await resolveWebServerProvider();
	if (provider === "caddy") {
		const settings = await getWebServerSettings();
		return {
			provider,
			enabled: Boolean(settings?.requestLogsEnabled),
			reloadResourceName: getWebServerResourceName(provider),
			accessLogPath: getLocalAccessLogPath(provider),
		};
	}

	const config = readMainConfig();
	const parsedConfig = config
		? (parse(config) as { accessLog?: { filePath?: string } })
		: null;
	return {
		provider,
		enabled: Boolean(parsedConfig?.accessLog?.filePath),
		reloadResourceName: getWebServerResourceName(provider),
		accessLogPath: getLocalAccessLogPath(provider),
	};
};

export const settingsRouter = createTRPCRouter({
	getWebServerSettings: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		const settings = await getWebServerSettings();
		return settings;
	}),
	reloadServer: adminProcedure.mutation(async ({ ctx }) => {
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
	cleanRedis: adminProcedure.mutation(async ({ ctx }) => {
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
	reloadRedis: adminProcedure.mutation(async ({ ctx }) => {
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
	cleanAllDeploymentQueue: adminProcedure.mutation(async ({ ctx }) => {
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
	getActiveWebServerProvider: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			return resolveWebServerProvider(input?.serverId);
		}),
	getCaddyTrustedProxySettings: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			if (IS_CLOUD && !input?.serverId) {
				return {
					mode: "disabled" as const,
					ranges: [],
					clientIpHeaders: [],
					strict: true,
				};
			}

			const settings = await getCaddyTrustedProxySettings(input?.serverId);
			return (
				settings ?? {
					mode: "disabled" as const,
					ranges: [],
					clientIpHeaders: [],
					strict: true,
				}
			);
		}),
	updateCaddyTrustedProxySettings: adminProcedure
		.input(apiCaddyTrustedProxySettings)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Caddy trusted proxy settings are only available for a local or remote web server.",
				});
			}

			const previousSettings = await getCaddyTrustedProxySettings(
				input.serverId,
			);
			const nextSettings =
				input.mode === "disabled"
					? null
					: {
							mode: input.mode,
							ranges: input.ranges,
							clientIpHeaders: input.clientIpHeaders,
							strict: input.strict,
						};

			const provider = await resolveWebServerProvider(input.serverId);
			await updateCaddyTrustedProxySettings(nextSettings, input.serverId);
			try {
				if (provider === "caddy") {
					await compileWriteAndReloadCaddyConfigSafely({
						serverId: input.serverId,
						...(await getCaddyCompileSettings(input.serverId)),
					});
				}
			} catch (error) {
				await updateCaddyTrustedProxySettings(previousSettings, input.serverId);
				throw error;
			}

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "caddy-trusted-proxy",
			});
			return (
				(await getCaddyTrustedProxySettings(input.serverId)) ?? {
					mode: "disabled" as const,
					ranges: [],
					clientIpHeaders: [],
					strict: true,
				}
			);
		}),
	updateActiveWebServerProvider: adminProcedure
		.input(apiWebServerProvider)
		.mutation(async ({ input, ctx }) => {
			if (input.provider === "caddy") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Caddy can only be activated through the migration apply flow after validation succeeds.",
				});
			}
			if (input.serverId) {
				await ensureServerAccess(ctx, input.serverId);
			}
			const currentProvider = await resolveWebServerProvider(input.serverId);
			if (currentProvider === "caddy" && input.provider === "traefik") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Use the Caddy migration rollback flow to return to Traefik safely.",
				});
			}
			if (input.serverId) {
				await updateRemoteWebServerProvider(input.serverId, input.provider);
			} else {
				await updateLocalWebServerProvider(input.provider);
			}
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "web-server-provider",
			});
			return true;
		}),
	reloadWebServer: adminProcedure
		.input(apiServerSchema)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			void reloadWebServerProvider(provider, input?.serverId).catch((err) => {
				console.error("reloadWebServer background:", err);
			});
			await audit(ctx, {
				action: "reload",
				resourceType: "settings",
				resourceName: getWebServerResourceName(provider),
			});
			return true;
		}),
	prepareCaddyMigration: adminProcedure
		.input(apiCaddyMigration)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			const report = await prepareCaddyMigrationDryRun({
				serverId: input.serverId,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "settings",
				resourceName: "caddy-migration-dry-run",
			});
			return report;
		}),
	getCaddyMigrationReport: adminProcedure
		.input(apiCaddyMigrationById)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			return readCaddyMigrationReport({
				migrationId: input.migrationId,
				serverId: input.serverId,
			});
		}),
	applyCaddyMigration: adminProcedure
		.input(apiApplyCaddyMigration)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			const report = await readCaddyMigrationReport({
				migrationId: input.migrationId,
				serverId: input.serverId,
			});
			if (report.summary.blockingWarnings > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot apply Caddy migration with ${report.summary.blockingWarnings} blocking warning(s)`,
				});
			}
			if (report.validation.status !== "passed") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Cannot apply Caddy migration because draft validation did not pass",
				});
			}
			void applyCaddyMigrationCutover({
				migrationId: input.migrationId,
				serverId: input.serverId,
			}).catch((err) => {
				console.error("applyCaddyMigration background:", err);
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "caddy-migration-apply",
			});
			return { started: true, migrationId: input.migrationId };
		}),
	rollbackCaddyMigration: adminProcedure
		.input(apiCaddyMigrationById)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			void rollbackCaddyMigrationCutover({
				migrationId: input.migrationId,
				serverId: input.serverId,
			}).catch((err) => {
				console.error("rollbackCaddyMigration background:", err);
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "caddy-migration-rollback",
			});
			return { started: true, migrationId: input.migrationId };
		}),
	toggleDashboard: adminProcedure
		.input(apiEnableDashboard)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			const provider = await resolveWebServerProvider(input.serverId);
			if (provider !== "traefik") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"The dashboard toggle is only available for Traefik. The Caddy admin API is kept local-only and is not exposed through Dokploy.",
				});
			}

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
	cleanMonitoring: adminProcedure.mutation(async ({ ctx }) => {
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
	getDockerDiskUsage: adminProcedure.query(async () => {
		if (IS_CLOUD) {
			return [];
		}
		return getDockerDiskUsage();
	}),
	saveSSHPrivateKey: adminProcedure
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
		.input(apiAssignDomain)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const previousSettings = await getWebServerSettings();
			if (!previousSettings) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Web server settings not found",
				});
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

			const provider = await resolveWebServerProvider();
			if (provider === "caddy") {
				try {
					await updateServerCaddy(settings, input.host);
				} catch (error) {
					await updateWebServerSettings({
						host: previousSettings.host,
						letsEncryptEmail: previousSettings.letsEncryptEmail,
						certificateType: previousSettings.certificateType,
						https: previousSettings.https,
					});
					throw error;
				}
			} else {
				updateServerTraefik(settings, input.host);
				if (input.letsEncryptEmail) {
					updateLetsEncryptEmail(input.letsEncryptEmail);
				}
			}

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "assign-domain-server",
			});
			return settings;
		}),
	cleanSSHPrivateKey: adminProcedure.mutation(async ({ ctx }) => {
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

	updateRemoteServersOnly: enterpriseProcedure
		.input(z.object({ remoteServersOnly: z.boolean() }))
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This feature is only available for self-hosted instances",
				});
			}

			await updateWebServerSettings({
				remoteServersOnly: input.remoteServersOnly,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "remote-servers-only",
			});
			return true;
		}),

	updateEnforceSSO: enterpriseProcedure
		.input(z.object({ enforceSSO: z.boolean() }))
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This feature is only available for self-hosted instances",
				});
			}

			await updateWebServerSettings({
				enforceSSO: input.enforceSSO,
			});

			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "enforce-sso",
			});
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

	readWebServerConfig: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			if (IS_CLOUD && !input?.serverId) {
				return true;
			}
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			return readProviderMainConfig(provider, input?.serverId);
		}),

	updateWebServerConfig: adminProcedure
		.input(apiWebServerConfig)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD && !input.serverId) {
				return true;
			}
			await ensureServerAccess(ctx, input.serverId);
			const provider = await resolveWebServerProvider(input.serverId);
			await writeProviderMainConfig(
				provider,
				input.webServerConfig,
				input.serverId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "web-server-config",
			});
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

	readMiddlewareTraefikConfig: adminProcedure.query(() => {
		if (IS_CLOUD) {
			return true;
		}
		const traefikConfig = readConfig("middlewares");
		return traefikConfig;
	}),

	updateMiddlewareTraefikConfig: adminProcedure
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
	getUpdateData: protectedProcedure.mutation(async () => {
		if (IS_CLOUD) {
			return DEFAULT_UPDATE_DATA;
		}

		return await getUpdateData(packageInfo.version);
	}),
	updateServer: adminProcedure.mutation(async ({ ctx }) => {
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
				await checkPermission(ctx, { traefikFiles: ["read"] });
				const { MAIN_TRAEFIK_PATH } = paths(!!input?.serverId);
				const result = await readDirectory(MAIN_TRAEFIK_PATH, input?.serverId);
				return result || [];
			} catch (error) {
				throw error;
			}
		}),

	readWebServerDirectories: protectedProcedure
		.input(apiServerSchema)
		.query(async ({ ctx, input }) => {
			await checkPermission(ctx, { traefikFiles: ["read"] });
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			if (provider === "caddy") {
				return readCaddySafeDirectoryTree(input?.serverId);
			}
			const { basePath } = getWebServerPaths(provider, !!input?.serverId);
			try {
				const result = await readDirectory(basePath, input?.serverId);
				return result || [];
			} catch (error) {
				if (
					error instanceof Error &&
					(error as NodeJS.ErrnoException).code === "ENOENT"
				) {
					return [];
				}
				throw error;
			}
		}),

	updateTraefikFile: protectedProcedure
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
	updateWebServerFile: protectedProcedure
		.input(apiModifyWebServerFile)
		.mutation(async ({ input, ctx }) => {
			await checkPermission(ctx, { traefikFiles: ["write"] });
			await ensureServerAccess(ctx, input.serverId);
			const provider = await resolveWebServerProvider(input.serverId);
			if (provider === "caddy") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Caddy generated config files are read-only from the file editor.",
				});
			}
			const filePath = resolveWebServerFilePath(
				input.path,
				provider,
				input.serverId,
			);
			await writeTraefikConfigInPath(
				filePath,
				input.webServerConfig,
				input.serverId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "web-server-file",
			});
			return true;
		}),

	readWebServerFile: protectedProcedure
		.input(apiReadWebServerFile)
		.query(async ({ input, ctx }) => {
			await checkPermission(ctx, { traefikFiles: ["read"] });
			await ensureServerAccess(ctx, input.serverId);
			const provider = await resolveWebServerProvider(input.serverId);
			const filePath = resolveWebServerFilePath(
				input.path,
				provider,
				input.serverId,
			);
			if (provider === "caddy") {
				assertCaddyReadableFilePath(filePath, input.serverId);
			}
			return readConfigInPath(filePath, input.serverId);
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

	getOpenApiDocument: protectedProcedure.query(
		async ({ ctx }): Promise<unknown> => {
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
	readWebServerEnv: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			return readEnvironmentVariables(
				getWebServerResourceName(provider),
				input?.serverId,
			);
		}),

	writeTraefikEnv: adminProcedure
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
	writeWebServerEnv: adminProcedure
		.input(apiWriteWebServerEnv)
		.mutation(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input.serverId);
			const provider = await resolveWebServerProvider(input.serverId);
			const resourceName = getWebServerResourceName(provider);
			const envs = prepareEnvironmentVariables(input.env);
			const ports = await readPorts(resourceName, input.serverId);

			void writeWebServerSetup(provider, {
				env: envs,
				additionalPorts: ports,
				serverId: input.serverId,
				...(await getCaddySetupOptions(provider, input.serverId)),
			}).catch((err) => {
				console.error("writeWebServerEnv background writeWebServerSetup:", err);
			});
			await audit(ctx, {
				action: "update",
				resourceType: "settings",
				resourceName: "web-server-env",
			});
			return true;
		}),
	haveTraefikDashboardPortEnabled: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports.some((port) => port.targetPort === 8080);
		}),
	getWebServerDashboardState: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			if (provider === "traefik") {
				const ports = await readPorts("dokploy-traefik", input?.serverId);
				return {
					provider,
					enabled: ports.some((port) => port.targetPort === 8080),
				};
			}

			return { provider, enabled: false };
		}),

	getRequestAnalyticsState: protectedProcedure.query(async () => {
		return getRequestAnalyticsState();
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
			const rawConfig = await readActiveRequestAccessLog(
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
			const rawConfig = await readActiveRequestAccessLog(
				!!input?.dateRange?.start || !!input?.dateRange?.end,
			);
			const processedLogs = processLogs(rawConfig as string, input?.dateRange);
			return processedLogs || [];
		}),
	haveActivateRequests: protectedProcedure.query(async () => {
		return (await getRequestAnalyticsState()).enabled;
	}),
	toggleRequests: protectedProcedure
		.input(
			z.object({
				enable: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				return true;
			}
			const provider = await resolveWebServerProvider();
			if (provider === "caddy") {
				const previousSettings = await getWebServerSettings();
				const previousEnabled = Boolean(previousSettings?.requestLogsEnabled);
				await updateWebServerSettings({
					requestLogsEnabled: input.enable,
				});
				try {
					await compileWriteAndValidateCaddyConfigSafely(
						await getCaddyCompileSettings(),
					);
				} catch (error) {
					await updateWebServerSettings({
						requestLogsEnabled: previousEnabled,
					});
					throw error;
				}
				await audit(ctx, {
					action: "update",
					resourceType: "settings",
					resourceName: "toggle-requests",
				});
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
	checkInfrastructureHealth: adminProcedure.query(async () => {
		const provider = await resolveWebServerProvider();
		if (IS_CLOUD) {
			const webServer = { provider, status: "healthy" as const };
			return {
				postgres: { status: "healthy" as const },
				redis: { status: "healthy" as const },
				webServer,
				traefik: { status: webServer.status },
			};
		}

		const [postgres, redis, webServer] = await Promise.all([
			checkPostgresHealth(),
			checkRedisHealth(),
			checkWebServerHealth(provider),
		]);

		return {
			postgres,
			redis,
			webServer,
			traefik: { status: webServer.status, message: webServer.message },
		};
	}),
	setupGPU: adminProcedure
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
		.input(apiServerSchema)
		.query(async ({ input }) => {
			const ports = await readPorts("dokploy-traefik", input?.serverId);
			return ports;
		}),
	updateWebServerPorts: adminProcedure
		.input(apiWebServerPorts)
		.mutation(async ({ input, ctx }) => {
			try {
				await ensureServerAccess(ctx, input.serverId);
				if (IS_CLOUD && !input.serverId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Please set a serverId to update web server ports",
					});
				}
				const provider = await resolveWebServerProvider(input.serverId);
				const resourceName = getWebServerResourceName(provider);
				const env = await readEnvironmentVariables(
					resourceName,
					input.serverId,
				);

				if (provider === "caddy") {
					const reservedPort = input.additionalPorts.find(
						isCaddyReservedAdditionalPort,
					);
					if (reservedPort) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Caddy port mapping ${reservedPort.publishedPort}->${reservedPort.targetPort}/${reservedPort.protocol ?? "tcp"} is reserved and cannot be published.`,
						});
					}
				}

				for (const port of input.additionalPorts) {
					const portCheck = await checkPortInUse(
						port.publishedPort,
						input.serverId,
					);
					if (portCheck.isInUse) {
						throw new TRPCError({
							code: "CONFLICT",
							message: `Port ${port.publishedPort} is already in use by ${portCheck.conflictingContainer}`,
						});
					}
				}
				const preparedEnv = prepareEnvironmentVariables(env);

				void writeWebServerSetup(provider, {
					env: preparedEnv,
					additionalPorts: input.additionalPorts,
					serverId: input.serverId,
					...(await getCaddySetupOptions(provider, input.serverId)),
				}).catch((err) => {
					console.error(
						"updateWebServerPorts background writeWebServerSetup:",
						err,
					);
				});
				await audit(ctx, {
					action: "update",
					resourceType: "settings",
					resourceName: "web-server-ports",
				});
				return true;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error updating web server ports",
					cause: error,
				});
			}
		}),
	getWebServerPorts: adminProcedure
		.input(apiServerSchema)
		.query(async ({ input, ctx }) => {
			await ensureServerAccess(ctx, input?.serverId);
			const provider = await resolveWebServerProvider(input?.serverId);
			return readPorts(getWebServerResourceName(provider), input?.serverId);
		}),
	updateLogCleanup: protectedProcedure
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
