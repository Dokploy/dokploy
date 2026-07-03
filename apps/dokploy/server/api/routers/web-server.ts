import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import {
	ACCESS_LOG_RETAINED_LINES,
	applyCaddyMigration as applyCaddyMigrationCutover,
	checkPortInUse,
	compileWriteAndReloadCaddyConfigSafely,
	findServerById,
	getCaddyCompileSettings,
	getCaddyTrustedProxySettings,
	getWebServerPaths,
	getWebServerResourceName,
	getWebServerSettings,
	IS_CLOUD,
	isCaddyReservedAdditionalPort,
	paths,
	prepareCaddyMigration as prepareCaddyMigrationDryRun,
	prepareEnvironmentVariables,
	readCaddyConfigFileIfExists,
	getCaddyMigrationReport as readCaddyMigrationReport,
	readConfigInPath,
	readDirectory,
	readEnvironmentVariables,
	readMainConfig,
	readMonitoringConfig,
	readPorts,
	reloadCaddyAfterValidation,
	reloadDockerResource,
	resolveWebServerProvider,
	rollbackCaddyMigration as rollbackCaddyMigrationCutover,
	updateCaddyTrustedProxySettings,
	updateLocalWebServerProvider,
	updateRemoteWebServerProvider,
	type WebServerProvider,
	writeMainConfig,
	writeTraefikConfigInPath,
	writeWebServerSetup,
} from "@dokploy/server";

import { checkPermission } from "@dokploy/server/services/permission";

import { TRPCError } from "@trpc/server";

import { parse } from "yaml";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { apiServerSchema } from "@/server/db/schema";

import { adminProcedure, protectedProcedure } from "../trpc";

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

export const ensureServerAccess = async (
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

export const readActiveRequestAccessLog = async (readAll = false) => {
	const provider = await resolveWebServerProvider();
	if (provider === "traefik") {
		return (await readMonitoringConfig(readAll)) ?? "";
	}
	return readAccessLogFile(getLocalAccessLogPath(provider));
};

export const getRequestAnalyticsState = async () => {
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

// Provider-neutral web-server and Caddy migration procedures, spread into
// settingsRouter so client paths stay api.settings.* — extracted from
// settings.ts to keep that router reviewable.
export const webServerProcedures = {
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
};
