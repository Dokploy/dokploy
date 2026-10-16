import { db } from "@dokploy/server/db";
import {
	type LibredbStudio,
	libredbStudio,
	libsql,
	mariadb,
	mongo,
	mysql,
	network,
	postgres,
	redis,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { classifyStudioDatabases, type StudioCoverage } from "./reachability";
import {
	hashSeedContent,
	renderSeedConfig,
	type SeedLabels,
	type StudioDatabase,
	serializeSeedConfig,
	validateSeedConfig,
} from "./seed";
import { removeStudioSeedDirectory, writeStudioSeed } from "./writer";

export interface LibreDBStudioScope {
	studio: LibredbStudio;
	application: {
		applicationId: string;
		appName: string;
		name: string;
		serverId: string | null;
		environmentId: string;
		networkIds: string[];
	};
	labels: SeedLabels;
	databases: StudioDatabase[];
	coverage: StudioCoverage;
}

const sharedColumns = {
	name: true,
	appName: true,
	serverId: true,
	networkIds: true,
	detachDokployNetwork: true,
	networkSwarm: true,
	applicationStatus: true,
} as const;

const sharedFields = (row: {
	name: string;
	appName: string;
	serverId: string | null;
	networkIds: string[] | null;
	detachDokployNetwork: boolean;
	networkSwarm: unknown;
	applicationStatus: StudioDatabase["applicationStatus"];
}) => ({
	name: row.name,
	appName: row.appName,
	serverId: row.serverId,
	networkIds: row.networkIds ?? [],
	detachDokployNetwork: row.detachDokployNetwork,
	// resolveServiceNetworks uses any stored override verbatim, even an empty
	// list, instead of dokploy-network and networkIds.
	hasNetworkSwarm: Boolean(row.networkSwarm),
	applicationStatus: row.applicationStatus,
});

export const loadStudioDatabases = async (
	environmentId: string,
): Promise<StudioDatabase[]> => {
	const [
		postgresRows,
		mysqlRows,
		mariadbRows,
		mongoRows,
		redisRows,
		libsqlRows,
	] = await Promise.all([
		db.query.postgres.findMany({
			where: eq(postgres.environmentId, environmentId),
			columns: {
				...sharedColumns,
				postgresId: true,
				databaseName: true,
				databaseUser: true,
				databasePassword: true,
			},
		}),
		db.query.mysql.findMany({
			where: eq(mysql.environmentId, environmentId),
			columns: {
				...sharedColumns,
				mysqlId: true,
				databaseName: true,
				databaseUser: true,
				databasePassword: true,
				databaseRootPassword: true,
			},
		}),
		db.query.mariadb.findMany({
			where: eq(mariadb.environmentId, environmentId),
			columns: {
				...sharedColumns,
				mariadbId: true,
				databaseName: true,
				databaseUser: true,
				databasePassword: true,
				databaseRootPassword: true,
			},
		}),
		db.query.mongo.findMany({
			where: eq(mongo.environmentId, environmentId),
			columns: {
				...sharedColumns,
				mongoId: true,
				databaseUser: true,
				databasePassword: true,
			},
		}),
		db.query.redis.findMany({
			where: eq(redis.environmentId, environmentId),
			columns: {
				...sharedColumns,
				redisId: true,
				databasePassword: true,
			},
		}),
		db.query.libsql.findMany({
			where: eq(libsql.environmentId, environmentId),
			columns: {
				...sharedColumns,
				libsqlId: true,
				databaseUser: true,
				databasePassword: true,
				sqldNode: true,
			},
		}),
	]);

	return [
		...postgresRows.map(
			(row): StudioDatabase => ({
				kind: "postgres",
				id: row.postgresId,
				...sharedFields(row),
				databaseName: row.databaseName,
				databaseUser: row.databaseUser,
				databasePassword: row.databasePassword,
				databaseRootPassword: null,
				sqldNode: null,
			}),
		),
		...mysqlRows.map(
			(row): StudioDatabase => ({
				kind: "mysql",
				id: row.mysqlId,
				...sharedFields(row),
				databaseName: row.databaseName,
				databaseUser: row.databaseUser,
				databasePassword: row.databasePassword,
				databaseRootPassword: row.databaseRootPassword,
				sqldNode: null,
			}),
		),
		...mariadbRows.map(
			(row): StudioDatabase => ({
				kind: "mariadb",
				id: row.mariadbId,
				...sharedFields(row),
				databaseName: row.databaseName,
				databaseUser: row.databaseUser,
				databasePassword: row.databasePassword,
				databaseRootPassword: row.databaseRootPassword,
				sqldNode: null,
			}),
		),
		...mongoRows.map(
			(row): StudioDatabase => ({
				kind: "mongo",
				id: row.mongoId,
				...sharedFields(row),
				databaseName: null,
				databaseUser: row.databaseUser,
				databasePassword: row.databasePassword,
				databaseRootPassword: null,
				sqldNode: null,
			}),
		),
		...redisRows.map(
			(row): StudioDatabase => ({
				kind: "redis",
				id: row.redisId,
				...sharedFields(row),
				databaseName: null,
				databaseUser: null,
				databasePassword: row.databasePassword,
				databaseRootPassword: null,
				sqldNode: null,
			}),
		),
		...libsqlRows.map(
			(row): StudioDatabase => ({
				kind: "libsql",
				id: row.libsqlId,
				...sharedFields(row),
				databaseName: null,
				databaseUser: row.databaseUser,
				databasePassword: row.databasePassword,
				databaseRootPassword: null,
				sqldNode: row.sqldNode,
			}),
		),
	];
};

const studioNotFound = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message: "LibreDB Studio not found",
	});

export const loadLibreDBStudioScope = async (
	libredbStudioId: string,
): Promise<LibreDBStudioScope> => {
	const row = await db.query.libredbStudio.findFirst({
		where: eq(libredbStudio.libredbStudioId, libredbStudioId),
		with: {
			application: {
				columns: {
					applicationId: true,
					appName: true,
					name: true,
					serverId: true,
					environmentId: true,
					networkIds: true,
				},
				with: {
					environment: {
						columns: { name: true },
						with: { project: { columns: { name: true } } },
					},
				},
			},
		},
	});
	if (!row) {
		throw studioNotFound();
	}
	const { application, ...studio } = row;
	const databases = await loadStudioDatabases(application.environmentId);
	const networkIds = [
		...new Set(databases.flatMap((database) => database.networkIds)),
	];
	const overlayNetworks =
		networkIds.length > 0
			? await db.query.network.findMany({
					where: and(
						inArray(network.networkId, networkIds),
						eq(network.driver, "overlay"),
					),
					columns: { networkId: true, serverId: true, driver: true },
				})
			: [];

	return {
		studio,
		application: {
			applicationId: application.applicationId,
			appName: application.appName,
			name: application.name,
			serverId: application.serverId,
			environmentId: application.environmentId,
			networkIds: application.networkIds ?? [],
		},
		labels: {
			projectName: application.environment.project.name,
			environmentName: application.environment.name,
		},
		databases,
		coverage: classifyStudioDatabases(
			databases,
			{ serverId: application.serverId },
			overlayNetworks,
		),
	};
};

// A Studio deleted or transferred while its seed was being written must not
// leave the credentials behind on the host it no longer uses.
const ensureStudioStillOnHost = async (
	libredbStudioId: string,
	scope: LibreDBStudioScope,
) => {
	const current = await db.query.libredbStudio.findFirst({
		where: eq(libredbStudio.libredbStudioId, libredbStudioId),
		columns: { libredbStudioId: true },
		with: { application: { columns: { serverId: true } } },
	});
	if (current && current.application.serverId === scope.application.serverId) {
		return;
	}
	await removeStudioSeedDirectory({
		appName: scope.application.appName,
		serverId: scope.application.serverId,
	});
	if (!current) {
		throw studioNotFound();
	}
	throw new Error(
		"The LibreDB Studio moved to another server while its seed was being written, so the copy on the previous server was removed",
	);
};

const writeSeedOnStudioHost = async (
	libredbStudioId: string,
	scope: LibreDBStudioScope,
	content: string,
) => {
	try {
		await writeStudioSeed({
			appName: scope.application.appName,
			serverId: scope.application.serverId,
			content,
		});
	} catch (error) {
		// Deleting the application removes its directory, so a write that
		// overlaps the deletion can fail half way; the check then removes what
		// the write left and reports the Studio as gone instead.
		await ensureStudioStillOnHost(libredbStudioId, scope);
		throw error;
	}
	await ensureStudioStillOnHost(libredbStudioId, scope);
};

const syncStudioSeed = async (
	libredbStudioId: string,
	options: { force?: boolean },
): Promise<{ changed: boolean; scope: LibreDBStudioScope }> => {
	try {
		const scope = await loadLibreDBStudioScope(libredbStudioId);
		const config = renderSeedConfig(scope.coverage.covered, scope.labels);
		if (config) {
			validateSeedConfig(config);
		}
		const content = serializeSeedConfig(config);
		const seedHash = hashSeedContent(content);
		const changed = seedHash !== scope.studio.seedHash;
		if (changed || options.force) {
			await writeSeedOnStudioHost(libredbStudioId, scope, content);
		}
		const [studio] = await db
			.update(libredbStudio)
			.set({
				seedHash,
				lastSyncedAt: new Date().toISOString(),
				lastSyncError: null,
			})
			.where(eq(libredbStudio.libredbStudioId, libredbStudioId))
			.returning();
		if (!studio) {
			throw studioNotFound();
		}
		return { changed, scope: { ...scope, studio } };
	} catch (error) {
		const [recorded] = await db
			.update(libredbStudio)
			.set({
				lastSyncError: error instanceof Error ? error.message : String(error),
			})
			.where(eq(libredbStudio.libredbStudioId, libredbStudioId))
			.returning({ libredbStudioId: libredbStudio.libredbStudioId });
		// No row to record the failure on means the Studio was deleted while
		// it synced, which callers treat as nothing left to do.
		if (!recorded) {
			throw studioNotFound();
		}
		throw error;
	}
};

// @dokploy/server is evaluated more than once per process: the custom server,
// which runs the deploy worker and the cron jobs, loads one copy and Next's
// route chunks load another. The chains therefore live on globalThis, like the
// pool in db/index.ts, so a deploy-time sync waits for one started by a request.
const globalForLibreDBStudioSync = globalThis as unknown as {
	__dokployLibreDBStudioSyncChains?: Map<string, Promise<void>>;
};

if (!globalForLibreDBStudioSync.__dokployLibreDBStudioSyncChains) {
	globalForLibreDBStudioSync.__dokployLibreDBStudioSyncChains = new Map();
}

const syncChains = globalForLibreDBStudioSync.__dokployLibreDBStudioSyncChains;

export const runLibreDBStudioSync = (
	libredbStudioId: string,
	options: { force?: boolean } = {},
): Promise<{ changed: boolean; scope: LibreDBStudioScope }> => {
	const previous = syncChains.get(libredbStudioId) ?? Promise.resolve();
	const run = previous.then(() => syncStudioSeed(libredbStudioId, options));
	// The caller receives the outcome through run; the chain only needs to
	// know when this sync has settled before the next one starts.
	const settled = run.then(
		() => undefined,
		() => undefined,
	);
	syncChains.set(libredbStudioId, settled);
	settled.then(() => {
		if (syncChains.get(libredbStudioId) === settled) {
			syncChains.delete(libredbStudioId);
		}
	});
	return run;
};
