import { randomBytes } from "node:crypto";
import {
	createApplication,
	createDomain,
	createMount,
	deleteAllMiddlewares,
	findApplicationById,
	findEnvironmentById,
	findLibsqlById,
	findMariadbById,
	findMongoById,
	findMySqlById,
	findPostgresById,
	findProjectById,
	findRedisById,
	findServerById,
	generateTraefikMeDomain,
	getAccessibleServerIds,
	getDomainHost,
	getWebServerSettings,
	IS_CLOUD,
	removeDeployments,
	removeDirectoryCode,
	removeMonitoringDirectory,
	removeService,
	removeTraefikConfig,
	updateApplication,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	createLibreDBStudio,
	findLibreDBStudioByApplicationId,
	findLibreDBStudiosByEnvironment,
	findLibreDBStudiosByScope,
	getLibreDBStudioView,
	type LibreDBStudioView,
	syncLibreDBStudio,
	withLibreDBStudioScopeLock,
} from "@dokploy/server/services/libredb-studio";
import {
	addNewService,
	checkEnvironmentAccess,
	checkPermission,
	checkServiceAccess,
	type PermissionCtx,
} from "@dokploy/server/services/permission";
import {
	INVALID_HOSTNAME_MESSAGE,
	VALID_HOSTNAME_REGEX,
} from "@dokploy/server/utils/hostname-validation";
import {
	getLibreDBStudioImage,
	LIBREDB_STUDIO_ADMIN_EMAIL,
	LIBREDB_STUDIO_DATA_DIR,
	LIBREDB_STUDIO_PORT,
} from "@dokploy/server/utils/libredb-studio/constants";
import { setEnvVar } from "@dokploy/server/utils/libredb-studio/env";
import { LIBREDB_STUDIO_ICON_DATA_URL } from "@dokploy/server/utils/libredb-studio/icon";
import type { StudioRole } from "@dokploy/server/utils/libredb-studio/launch-token";
import {
	type StudioDatabaseKind,
	seedConnectionId,
} from "@dokploy/server/utils/libredb-studio/seed";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { slugify } from "@/lib/slug";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import { apiFindOneApplication, applications } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { cleanQueuesByApplication, myQueue } from "@/server/queues/queueSetup";

type StudioCtx = PermissionCtx & {
	session: { userId: string; activeOrganizationId: string };
};

interface LibreDBStudioDatabaseCoverage {
	studio: LibreDBStudioView | null;
	seedId: string;
	covered: boolean;
	reason: string | null;
	canInstall: boolean;
	databaseStatus: "idle" | "running" | "done" | "error";
	environmentId: string;
	serverId: string | null;
}

const STUDIO_NAME = "LibreDB Studio";
const STUDIO_DESCRIPTION =
	"Managed by the LibreDB Studio integration. Do not change the image or networks by hand.";
const STUDIO_APP_NAME_SUFFIX = "-libredb-studio";
// Swarm rejects a service name longer than 63 characters, and buildAppName appends "-" and six characters.
const MAX_PROJECT_SLUG_LENGTH = 63 - STUDIO_APP_NAME_SUFFIX.length - 7;
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const NO_STUDIO_ACCESS_REASON =
	"A LibreDB Studio manages this database, but you do not have access to it.";
const NO_SERVER_IP_MESSAGE =
	"This server has no IP address to build a generated domain from. Use a custom domain.";

const databaseKindSchema = z.enum([
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
]);

const libredbStudioProcedure = protectedProcedure.use(({ next }) => {
	if (IS_CLOUD) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "LibreDB Studio is not available on Dokploy Cloud",
		});
	}
	return next();
});

const studioAppName = (projectName: string) =>
	`${slugify(projectName).slice(0, MAX_PROJECT_SLUG_LENGTH).replace(/-+$/, "")}${STUDIO_APP_NAME_SUFFIX}`;

// The secrets live only in the libredb_studio row, because application.one
// returns the decrypted application env to every member who can read the Studio.
const generateStudioSecrets = () => ({
	launchSecret: randomBytes(32).toString("hex"),
	jwtSecret: randomBytes(48).toString("base64url"),
	adminPassword: randomBytes(18).toString("base64url"),
});

const buildStudioEnv = (plainHttp: boolean) => {
	const entries: [string, string][] = [
		["ADMIN_EMAIL", LIBREDB_STUDIO_ADMIN_EMAIL],
		["STORAGE_PROVIDER", "sqlite"],
		["STORAGE_SQLITE_PATH", `${LIBREDB_STUDIO_DATA_DIR}/libredb-storage.db`],
		["LIBREDB_EMBEDDED_SAMPLE", "false"],
		["SQLITE_EMBEDDED_SAMPLE", "false"],
	];
	if (plainHttp) {
		entries.push(["AUTH_COOKIE_SECURE", "false"]);
	}
	return entries.reduce((env, [key, value]) => setEnvVar(env, key, value), "");
};

const toStudioRole = (role: string): StudioRole =>
	role === "owner" || role === "admin" ? "admin" : "user";

const isPermitted = async (check: () => Promise<unknown>) => {
	try {
		await check();
		return true;
	} catch (error) {
		if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
			return false;
		}
		throw error;
	}
};

const canInstallStudio = async (
	ctx: StudioCtx,
	projectId: string,
	environmentId: string,
	serverId: string | null,
) => {
	if (serverId) {
		const accessibleIds = await getAccessibleServerIds(ctx.session);
		if (!accessibleIds.has(serverId)) {
			return false;
		}
	} else {
		const webServerSettings = await getWebServerSettings();
		if (webServerSettings?.remoteServersOnly) {
			return false;
		}
	}
	return (
		(await isPermitted(() => checkServiceAccess(ctx, projectId, "create"))) &&
		(await isPermitted(() =>
			checkEnvironmentAccess(ctx, environmentId, "read"),
		)) &&
		(await isPermitted(() => checkPermission(ctx, { deployment: ["create"] })))
	);
};

const findStudioDatabase = (kind: StudioDatabaseKind, databaseId: string) => {
	switch (kind) {
		case "postgres":
			return findPostgresById(databaseId);
		case "mysql":
			return findMySqlById(databaseId);
		case "mariadb":
			return findMariadbById(databaseId);
		case "mongo":
			return findMongoById(databaseId);
		case "redis":
			return findRedisById(databaseId);
		case "libsql":
			return findLibsqlById(databaseId);
	}
};

const databaseNotFound = () =>
	new TRPCError({ code: "NOT_FOUND", message: "Database not found" });

// Owners and admins pass checkServiceAccess for any id, so a database of
// another organization must answer exactly like a missing one.
const findStudioDatabaseForOrganization = async (
	kind: StudioDatabaseKind,
	databaseId: string,
	activeOrganizationId: string,
) => {
	let database: Awaited<ReturnType<typeof findStudioDatabase>>;
	try {
		database = await findStudioDatabase(kind, databaseId);
	} catch (error) {
		if (error instanceof TRPCError && error.code === "NOT_FOUND") {
			throw databaseNotFound();
		}
		throw error;
	}
	if (database.environment.project.organizationId !== activeOrganizationId) {
		throw databaseNotFound();
	}
	return database;
};

const logCleanupFailure = (applicationId: string, error: unknown) => {
	console.error(
		`Failed to clean up the partly installed LibreDB Studio application ${applicationId}:`,
		error,
	);
};

// Cleanup failures are logged rather than thrown, so the error that stopped the install reaches the caller.
const removePartialStudio = async (applicationId: string) => {
	try {
		const application = await findApplicationById(applicationId);
		await db
			.delete(applications)
			.where(eq(applications.applicationId, applicationId));
		await cleanQueuesByApplication(applicationId);
		const cleanupOperations = [
			() => deleteAllMiddlewares(application),
			() => removeDeployments(application),
			() => removeDirectoryCode(application.appName, application.serverId),
			() =>
				removeMonitoringDirectory(application.appName, application.serverId),
			() => removeTraefikConfig(application.appName, application.serverId),
			() => removeService(application.appName, application.serverId),
		];
		for (const operation of cleanupOperations) {
			try {
				await operation();
			} catch (error) {
				logCleanupFailure(applicationId, error);
			}
		}
	} catch (error) {
		logCleanupFailure(applicationId, error);
	}
};

export const libredbStudioRouter = createTRPCRouter({
	install: libredbStudioProcedure
		.meta({
			openapi: {
				path: "/libredb-studio/install",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(
			z.object({
				environmentId: z.string().min(1),
				serverId: z.string().min(1).optional(),
				domain: z.discriminatedUnion("kind", [
					z.object({ kind: z.literal("generated") }),
					z.object({
						kind: z.literal("custom"),
						host: z
							.string()
							.trim()
							.regex(VALID_HOSTNAME_REGEX, INVALID_HOSTNAME_MESSAGE),
					}),
				]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const environment = await findEnvironmentById(input.environmentId);
			const project = await findProjectById(environment.projectId);

			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this project",
				});
			}

			await checkServiceAccess(ctx, project.projectId, "create");
			await checkPermission(ctx, { deployment: ["create"] });
			// The installer is granted the Studio, which opens every database of the environment.
			await checkEnvironmentAccess(ctx, input.environmentId, "read");

			const webServerSettings = await getWebServerSettings();
			if (webServerSettings?.remoteServersOnly && !input.serverId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You need to use a server to install LibreDB Studio",
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

			// generateTraefikMeDomain falls back to 127.0.0.1 for a server without an IP, which outside development points every visitor at their own machine.
			if (
				input.domain.kind === "generated" &&
				process.env.NODE_ENV !== "development"
			) {
				const serverIp = input.serverId
					? (await findServerById(input.serverId)).ipAddress
					: webServerSettings?.serverIp;
				if (!serverIp?.trim()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: NO_SERVER_IP_MESSAGE,
					});
				}
			}

			const scope = {
				environmentId: input.environmentId,
				serverId: input.serverId ?? null,
			};
			const plainHttp = input.domain.kind === "generated";

			const { application, studio, domain } = await withLibreDBStudioScopeLock(
				scope,
				async () => {
					const existing = await findLibreDBStudiosByScope(scope);
					if (existing.length > 0) {
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"A LibreDB Studio already exists for this environment and server",
						});
					}

					const application = await createApplication({
						name: STUDIO_NAME,
						appName: studioAppName(project.name),
						description: STUDIO_DESCRIPTION,
						environmentId: input.environmentId,
						serverId: input.serverId,
						sourceType: "docker",
					});

					try {
						await updateApplication(application.applicationId, {
							sourceType: "docker",
							dockerImage: getLibreDBStudioImage(),
							env: buildStudioEnv(plainHttp),
							icon: LIBREDB_STUDIO_ICON_DATA_URL,
							replicas: 1,
							// The Debian image has no curl or wget, so the probe runs on the bundled node.
							healthCheckSwarm: {
								Test: [
									"CMD",
									"node",
									"-e",
									`fetch('http://127.0.0.1:${LIBREDB_STUDIO_PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
								],
								Interval: 30 * NANOSECONDS_PER_SECOND,
								Timeout: 5 * NANOSECONDS_PER_SECOND,
								StartPeriod: 15 * NANOSECONDS_PER_SECOND,
								Retries: 3,
							},
							// Start-first would run two Studio tasks on the same SQLite volume during an update or a rollback.
							updateConfigSwarm: {
								Parallelism: 1,
								Order: "stop-first",
								FailureAction: "rollback",
							},
							rollbackConfigSwarm: {
								Parallelism: 1,
								Order: "stop-first",
							},
						});

						await createMount({
							serviceId: application.applicationId,
							serviceType: "application",
							type: "volume",
							volumeName: `${application.appName}-data`,
							mountPath: LIBREDB_STUDIO_DATA_DIR,
						});

						const studio = await createLibreDBStudio({
							applicationId: application.applicationId,
							...generateStudioSecrets(),
						});

						await addNewService(ctx, application.applicationId);

						const host =
							input.domain.kind === "custom"
								? input.domain.host
								: await generateTraefikMeDomain(
										application.appName,
										ctx.user.ownerId,
										input.serverId,
									);

						const domain = await createDomain({
							host,
							port: LIBREDB_STUDIO_PORT,
							https: !plainHttp,
							certificateType: plainHttp ? "none" : "letsencrypt",
							applicationId: application.applicationId,
							domainType: "application",
						});

						return { application, studio, domain };
					} catch (error) {
						await removePartialStudio(application.applicationId);
						throw error;
					}
				},
			);

			// syncLibreDBStudio has recorded the failure in lastSyncError, and the deploy-time render heals it or fails the deploy with the reason.
			try {
				await syncLibreDBStudio(studio.libredbStudioId, { force: true });
			} catch (error) {
				console.error(
					`[libredb-studio] Seed sync failed for Studio ${studio.libredbStudioId} during the install:`,
					error,
				);
			}

			try {
				const jobData: DeploymentJob = {
					applicationId: application.applicationId,
					titleLog: "LibreDB Studio installation",
					descriptionLog: "",
					type: "deploy",
					applicationType: "application",
					server: !!input.serverId,
					serverId: input.serverId,
				};
				await myQueue.add(
					"deployments",
					{ ...jobData },
					{ removeOnComplete: true, removeOnFail: true },
				);
			} catch (error) {
				await removePartialStudio(application.applicationId);
				throw error;
			}

			await audit(ctx, {
				action: "create",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});
			await audit(ctx, {
				action: "deploy",
				resourceType: "application",
				resourceId: application.applicationId,
				resourceName: application.appName,
			});

			return {
				libredbStudioId: studio.libredbStudioId,
				applicationId: application.applicationId,
				url: getDomainHost(domain),
			};
		}),

	byEnvironment: libredbStudioProcedure
		.meta({
			openapi: {
				path: "/libredb-studio/by-environment",
				method: "GET",
				override: true,
				enabled: false,
			},
		})
		.input(z.object({ environmentId: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			const environment = await findEnvironmentById(input.environmentId);
			if (
				environment.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this environment",
				});
			}

			await checkEnvironmentAccess(ctx, input.environmentId, "read");

			const studios = await findLibreDBStudiosByEnvironment(
				input.environmentId,
			);
			const permitted = await Promise.all(
				studios.map((studio) =>
					isPermitted(() =>
						checkServiceAccess(ctx, studio.applicationId, "read"),
					),
				),
			);
			return Promise.all(
				studios
					.filter((_, index) => permitted[index])
					.map((studio) => getLibreDBStudioView(studio.libredbStudioId)),
			);
		}),

	byApplication: libredbStudioProcedure
		.meta({
			openapi: {
				path: "/libredb-studio/by-application",
				method: "GET",
				override: true,
				enabled: false,
			},
		})
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			const studio = await findLibreDBStudioByApplicationId(
				input.applicationId,
			);
			const isOwnStudio =
				studio !== null &&
				studio.application.environment.project.organizationId ===
					ctx.session.activeOrganizationId;

			await checkServiceAccess(ctx, input.applicationId, "read");

			if (!isOwnStudio) {
				return null;
			}
			return getLibreDBStudioView(studio.libredbStudioId);
		}),

	forDatabase: libredbStudioProcedure
		.meta({
			openapi: {
				path: "/libredb-studio/for-database",
				method: "GET",
				override: true,
				enabled: false,
			},
		})
		.input(
			z.object({
				databaseType: databaseKindSchema,
				databaseId: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }): Promise<LibreDBStudioDatabaseCoverage> => {
			const database = await findStudioDatabaseForOrganization(
				input.databaseType,
				input.databaseId,
				ctx.session.activeOrganizationId,
			);
			await checkServiceAccess(ctx, input.databaseId, "read");

			const serverId = database.serverId ?? null;
			const base = {
				seedId: seedConnectionId(input.databaseType, input.databaseId),
				databaseStatus: database.applicationStatus,
				environmentId: database.environmentId,
				serverId,
			};

			const [studio] = await findLibreDBStudiosByScope({
				environmentId: database.environmentId,
				serverId,
			});

			if (!studio) {
				return {
					...base,
					studio: null,
					covered: false,
					reason: null,
					canInstall: await canInstallStudio(
						ctx,
						database.environment.projectId,
						database.environmentId,
						serverId,
					),
				};
			}

			const canOpenStudio = await isPermitted(() =>
				checkServiceAccess(ctx, studio.applicationId, "read"),
			);
			if (!canOpenStudio) {
				return {
					...base,
					studio: null,
					covered: false,
					reason: NO_STUDIO_ACCESS_REASON,
					canInstall: false,
				};
			}

			const view = await getLibreDBStudioView(studio.libredbStudioId);
			const isThisDatabase = (entry: {
				kind: StudioDatabaseKind;
				id: string;
			}) => entry.kind === input.databaseType && entry.id === input.databaseId;

			if (view.covered.some(isThisDatabase)) {
				return {
					...base,
					studio: view,
					covered: true,
					reason: null,
					canInstall: false,
				};
			}

			const exclusion = view.excluded.find(isThisDatabase);
			if (!exclusion) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						"The LibreDB Studio of this environment and server does not list this database",
				});
			}

			return {
				...base,
				studio: view,
				covered: false,
				reason: exclusion.message,
				canInstall: false,
			};
		}),
});
