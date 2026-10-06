import { db } from "@dokploy/server/db";
import {
	applications,
	type LibredbStudio,
	libredbStudio,
	server,
} from "@dokploy/server/db/schema";
import type { InferResultType } from "@dokploy/server/types/with";
import { mechanizeDockerContainer } from "@dokploy/server/utils/builders";
import { getLibreDBStudioImage } from "@dokploy/server/utils/libredb-studio/constants";
import { readEnvVar } from "@dokploy/server/utils/libredb-studio/env";
import {
	isBelowMinimumStudioVersion,
	isStudioImageUpdateAvailable,
} from "@dokploy/server/utils/libredb-studio/image";
import {
	type ExclusionReason,
	exclusionMessage,
} from "@dokploy/server/utils/libredb-studio/reachability";
import {
	type StudioDatabaseKind,
	seedConnectionId,
} from "@dokploy/server/utils/libredb-studio/seed";
import {
	loadLibreDBStudioScope,
	runLibreDBStudioSync,
} from "@dokploy/server/utils/libredb-studio/sync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import { findApplicationById, updateApplication } from "./application";

const SYNC_DEBOUNCE_MS = 1000;

const RECONCILE_JOB_NAME = "libredb-studio-reconcile";

const RECONCILE_CRON = "*/5 * * * *";

// Studio reads AUTH_COOKIE_SECURE with these spellings for "off", trimmed
// and case-insensitive (libredb-studio src/lib/auth.ts, readCookieSecureOverride).
const COOKIE_SECURE_OFF = new Set(["off", "false", "0"]);

// drizzle builds the nested application row with one json_build_array call,
// and PostgreSQL refuses more than 100 arguments: the application table has
// more columns than that.
const studioWithApplication = {
	application: {
		columns: {
			applicationId: true,
			name: true,
			appName: true,
			environmentId: true,
			serverId: true,
			applicationStatus: true,
			dockerImage: true,
			env: true,
		},
		with: {
			environment: { with: { project: true } },
			server: true,
			domains: true,
		},
	},
} as const;

export type LibredbStudioWithApplication = InferResultType<
	"libredbStudio",
	typeof studioWithApplication
>;

type LibreDBStudioScopeKey = { environmentId: string; serverId: string | null };

interface ScheduledScope {
	scope: LibreDBStudioScopeKey;
	timer: ReturnType<typeof setTimeout> | null;
	running: boolean;
	dirty: boolean;
}

// @dokploy/server is evaluated more than once per process: the custom server,
// which runs the deploy worker and the cron jobs, loads one copy and Next's
// route chunks load another. The locks, chains and timers therefore live on
// globalThis, like the pool in db/index.ts, so that every copy shares them.
const globalForLibreDBStudio = globalThis as unknown as {
	__dokployLibreDBStudioState?: {
		scopeLocks: Map<string, Promise<void>>;
		studioSyncs: Map<string, Promise<void>>;
		scheduledScopes: Map<string, ScheduledScope>;
	};
};

if (!globalForLibreDBStudio.__dokployLibreDBStudioState) {
	globalForLibreDBStudio.__dokployLibreDBStudioState = {
		scopeLocks: new Map(),
		studioSyncs: new Map(),
		scheduledScopes: new Map(),
	};
}

const { scopeLocks, studioSyncs, scheduledScopes } =
	globalForLibreDBStudio.__dokployLibreDBStudioState;

export const studioNotFound = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message: "LibreDB Studio not found",
	});

export const findLibreDBStudioById = async (
	libredbStudioId: string,
): Promise<LibredbStudioWithApplication> => {
	const studio = await db.query.libredbStudio.findFirst({
		where: eq(libredbStudio.libredbStudioId, libredbStudioId),
		with: studioWithApplication,
	});
	if (!studio) {
		throw studioNotFound();
	}
	return studio;
};

export const findLibreDBStudioByApplicationId = async (
	applicationId: string,
): Promise<LibredbStudioWithApplication | null> => {
	const studio = await db.query.libredbStudio.findFirst({
		where: eq(libredbStudio.applicationId, applicationId),
		with: studioWithApplication,
	});
	return studio ?? null;
};

export const findLibreDBStudiosByEnvironment = async (
	environmentId: string,
): Promise<LibredbStudioWithApplication[]> =>
	await db.query.libredbStudio.findMany({
		where: inArray(
			libredbStudio.applicationId,
			db
				.select({ applicationId: applications.applicationId })
				.from(applications)
				.where(eq(applications.environmentId, environmentId)),
		),
		with: studioWithApplication,
		orderBy: asc(libredbStudio.createdAt),
	});

export const findLibreDBStudiosByScope = async (
	scope: LibreDBStudioScopeKey,
): Promise<LibredbStudioWithApplication[]> => {
	const studios = await findLibreDBStudiosByEnvironment(scope.environmentId);
	return studios.filter(
		(studio) =>
			(studio.application.serverId ?? null) === (scope.serverId ?? null),
	);
};

export const createLibreDBStudio = async (input: {
	applicationId: string;
	launchSecret: string;
	jwtSecret: string;
	adminPassword: string;
}): Promise<LibredbStudio> => {
	const [studio] = await db
		.insert(libredbStudio)
		.values({
			applicationId: input.applicationId,
			launchSecret: input.launchSecret,
			jwtSecret: input.jwtSecret,
			adminPassword: input.adminPassword,
		})
		.returning();
	if (!studio) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the LibreDB Studio record",
		});
	}
	return studio;
};

export const updateLibreDBStudio = async (
	libredbStudioId: string,
	data: Partial<Pick<LibredbStudio, "allowCustomConnections">>,
): Promise<LibredbStudio> => {
	const [studio] = await db
		.update(libredbStudio)
		.set(data)
		.where(eq(libredbStudio.libredbStudioId, libredbStudioId))
		.returning();
	if (!studio) {
		throw studioNotFound();
	}
	return studio;
};

const scopeKey = (scope: LibreDBStudioScopeKey) =>
	JSON.stringify([scope.environmentId, scope.serverId ?? null]);

const runInChain = async <T>(
	chains: Map<string, Promise<void>>,
	key: string,
	fn: () => Promise<T>,
): Promise<T> => {
	const previous = chains.get(key) ?? Promise.resolve();
	const run = previous.then(fn);
	// The caller receives the outcome through run; the next caller on this
	// key only needs to know that this one has finished.
	const settled = run.then(
		() => undefined,
		() => undefined,
	);
	chains.set(key, settled);
	try {
		return await run;
	} finally {
		if (chains.get(key) === settled) {
			chains.delete(key);
		}
	}
};

export const withLibreDBStudioScopeLock = <T>(
	scope: LibreDBStudioScopeKey,
	fn: () => Promise<T>,
): Promise<T> => runInChain(scopeLocks, scopeKey(scope), fn);

const sameNetworkIds = (left: string[], right: string[]) => {
	const a = [...new Set(left)].sort();
	const b = [...new Set(right)].sort();
	return a.length === b.length && a.every((id, index) => id === b[index]);
};

const removeStudioService = async (application: {
	appName: string;
	serverId: string | null;
}) => {
	const docker = await getRemoteDocker(application.serverId);
	try {
		await docker.getService(application.appName).remove();
	} catch (error) {
		// Docker answers 404 when the deletion removed the service first.
		if ((error as { statusCode?: number })?.statusCode !== 404) {
			throw error;
		}
	}
};

// mechanizeDockerContainer creates the service when it is missing, so a
// re-apply that overlaps the deletion of the Studio's application could bring
// back the service that the deletion has just removed.
const failIfStudioApplicationDeleted = async (application: {
	applicationId: string;
	appName: string;
	serverId: string | null;
}) => {
	const current = await db.query.applications.findFirst({
		where: eq(applications.applicationId, application.applicationId),
		columns: { applicationId: true },
	});
	if (current) {
		return;
	}
	await removeStudioService(application);
	throw studioNotFound();
};

export const syncLibreDBStudio = (
	libredbStudioId: string,
	options: { force?: boolean } = {},
): Promise<{ changed: boolean; networksChanged: boolean }> =>
	runInChain(studioSyncs, libredbStudioId, async () => {
		const { changed, scope } = await runLibreDBStudioSync(
			libredbStudioId,
			options,
		);
		const requiredNetworkIds = scope.coverage.requiredNetworkIds;
		if (sameNetworkIds(requiredNetworkIds, scope.application.networkIds)) {
			return { changed, networksChanged: false };
		}
		const application = await findApplicationById(
			scope.application.applicationId,
		);
		// A deploy in progress may already have read the old networks, and
		// re-applying the spec of a stopped or never deployed Studio would start
		// it. Starting a Studio only scales its existing service, so the row
		// must keep the old networks until a re-apply really changed them, or
		// no later sync would see the difference.
		if (application.applicationStatus !== "done") {
			return { changed, networksChanged: false };
		}
		try {
			await mechanizeDockerContainer({
				...application,
				networkIds: requiredNetworkIds,
			});
			await updateApplication(application.applicationId, {
				networkIds: requiredNetworkIds,
			});
		} catch (error) {
			await failIfStudioApplicationDeleted(application);
			await db
				.update(libredbStudio)
				.set({
					lastSyncError: `Updating the Studio networks failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				})
				.where(eq(libredbStudio.libredbStudioId, libredbStudioId));
			throw error;
		}
		await failIfStudioApplicationDeleted(application);
		return { changed, networksChanged: true };
	});

const isStudioGone = (error: unknown) =>
	error instanceof TRPCError && error.code === "NOT_FOUND";

const syncLibreDBStudioAndLogFailure = async (libredbStudioId: string) => {
	try {
		await syncLibreDBStudio(libredbStudioId);
	} catch (error) {
		if (!isStudioGone(error)) {
			console.error(
				`[libredb-studio] Seed sync failed for Studio ${libredbStudioId}:`,
				error,
			);
		}
	}
};

const syncScope = async (scope: LibreDBStudioScopeKey) => {
	let studios: LibredbStudioWithApplication[];
	try {
		studios = await findLibreDBStudiosByScope(scope);
	} catch (error) {
		console.error(
			`[libredb-studio] Could not list the Studios of environment ${scope.environmentId}:`,
			error,
		);
		return;
	}
	for (const studio of studios) {
		await syncLibreDBStudioAndLogFailure(studio.libredbStudioId);
	}
};

const runScheduledScope = async (key: string, entry: ScheduledScope) => {
	if (entry.running) {
		entry.dirty = true;
		return;
	}
	entry.running = true;
	try {
		do {
			entry.dirty = false;
			await syncScope(entry.scope);
		} while (entry.dirty);
	} finally {
		entry.running = false;
		if (!entry.timer) {
			scheduledScopes.delete(key);
		}
	}
};

export const scheduleLibreDBStudioSync = (
	scope: LibreDBStudioScopeKey,
): void => {
	// Callers have already committed their database change, so a scheduling
	// problem is logged here instead of failing that operation.
	try {
		const key = scopeKey(scope);
		const entry = scheduledScopes.get(key) ?? {
			scope: {
				environmentId: scope.environmentId,
				serverId: scope.serverId ?? null,
			},
			timer: null,
			running: false,
			dirty: false,
		};
		if (entry.timer) {
			clearTimeout(entry.timer);
		}
		entry.timer = setTimeout(() => {
			entry.timer = null;
			void runScheduledScope(key, entry);
		}, SYNC_DEBOUNCE_MS);
		scheduledScopes.set(key, entry);
	} catch (error) {
		console.error("[libredb-studio] Could not schedule a seed sync:", error);
	}
};

export const reconcileLibreDBStudios = async (): Promise<void> => {
	const studios = await db.query.libredbStudio.findMany({
		columns: { libredbStudioId: true },
	});
	for (const studio of studios) {
		await syncLibreDBStudioAndLogFailure(studio.libredbStudioId);
	}
};

export const initLibreDBStudioReconcileJob = (): void => {
	scheduleJob(RECONCILE_JOB_NAME, RECONCILE_CRON, async () => {
		// node-schedule turns a rejected job into an "error" event, which throws
		// when nothing listens, so the failure is logged here instead.
		try {
			await reconcileLibreDBStudios();
		} catch (error) {
			console.error("[libredb-studio] Reconcile job failed:", error);
		}
	});
};

export const getLibreDBStudioUrl = (
	domains: {
		host: string;
		https: boolean;
		path?: string | null;
		domainType?: string | null;
		enabled?: boolean;
	}[],
): { url: string; https: boolean } | null => {
	// Studio serves from the root of its host, so a domain under a path would
	// send the launch token to whatever serves the root of that host.
	const candidates = domains.filter(
		(domain) =>
			domain.enabled !== false &&
			(domain.domainType ?? "application") === "application" &&
			(!domain.path || domain.path === "/"),
	);
	const domain =
		candidates.find((candidate) => candidate.https) ?? candidates[0];
	if (!domain) {
		return null;
	}
	return {
		url: `${domain.https ? "https" : "http"}://${domain.host}`,
		https: domain.https,
	};
};

export interface LibreDBStudioView {
	libredbStudioId: string;
	applicationId: string;
	name: string;
	appName: string;
	environmentId: string;
	projectId: string;
	serverId: string | null;
	serverName: string | null;
	applicationStatus: "idle" | "running" | "done" | "error";
	url: string | null;
	https: boolean;
	image: string | null;
	recommendedImage: string;
	updateAvailable: boolean;
	belowMinimumVersion: boolean;
	allowCustomConnections: boolean;
	cookieSettingMismatch: boolean;
	lastSyncedAt: string | null;
	lastSyncError: string | null;
	covered: {
		kind: StudioDatabaseKind;
		id: string;
		name: string;
		seedId: string;
		applicationStatus: string;
	}[];
	excluded: {
		kind: StudioDatabaseKind;
		id: string;
		name: string;
		reason: ExclusionReason;
		message: string;
	}[];
}

const findServerNames = async (serverIds: string[]) => {
	const ids = [...new Set(serverIds)];
	if (ids.length === 0) {
		return new Map<string, string>();
	}
	const rows = await db.query.server.findMany({
		where: inArray(server.serverId, ids),
		columns: { serverId: true, name: true },
	});
	return new Map(rows.map((row) => [row.serverId, row.name]));
};

export const getLibreDBStudioView = async (
	libredbStudioId: string,
): Promise<LibreDBStudioView> => {
	const studio = await findLibreDBStudioById(libredbStudioId);
	const scope = await loadLibreDBStudioScope(libredbStudioId);
	const { application } = studio;
	const launch = getLibreDBStudioUrl(application.domains);
	const recommendedImage = getLibreDBStudioImage();
	const cookieSecureOff = COOKIE_SECURE_OFF.has(
		readEnvVar(application.env, "AUTH_COOKIE_SECURE")?.trim().toLowerCase() ??
			"",
	);
	const serverNames = await findServerNames(
		scope.coverage.excluded.flatMap(({ database, reason }) =>
			reason === "other-server" && database.serverId ? [database.serverId] : [],
		),
	);

	return {
		libredbStudioId: studio.libredbStudioId,
		applicationId: application.applicationId,
		name: application.name,
		appName: application.appName,
		environmentId: application.environmentId,
		projectId: application.environment.projectId,
		serverId: application.serverId,
		serverName: application.server?.name ?? null,
		applicationStatus: application.applicationStatus,
		url: launch?.url ?? null,
		https: launch?.https ?? false,
		image: application.dockerImage,
		recommendedImage,
		updateAvailable: isStudioImageUpdateAvailable(
			application.dockerImage,
			recommendedImage,
		),
		belowMinimumVersion: isBelowMinimumStudioVersion(application.dockerImage),
		allowCustomConnections: studio.allowCustomConnections,
		// Studio needs AUTH_COOKIE_SECURE off exactly when it is reached over
		// plain HTTP.
		cookieSettingMismatch: launch !== null && launch.https === cookieSecureOff,
		lastSyncedAt: studio.lastSyncedAt,
		lastSyncError: studio.lastSyncError,
		covered: scope.coverage.covered.map((database) => ({
			kind: database.kind,
			id: database.id,
			name: database.name,
			seedId: seedConnectionId(database.kind, database.id),
			applicationStatus: database.applicationStatus,
		})),
		excluded: scope.coverage.excluded.map(({ database, reason }) => ({
			kind: database.kind,
			id: database.id,
			name: database.name,
			reason,
			message: exclusionMessage(
				reason,
				reason === "other-server" && database.serverId
					? (serverNames.get(database.serverId) ?? database.serverId)
					: null,
			),
		})),
	};
};
