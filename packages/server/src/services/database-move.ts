import path from "node:path";
import { paths } from "@dokploy/server/constants";
import {
	deployLibsql,
	findLibsqlById,
	updateLibsqlById,
} from "@dokploy/server/services/libsql";
import {
	deployMariadb,
	findMariadbById,
	updateMariadbById,
} from "@dokploy/server/services/mariadb";
import {
	deployMongo,
	findMongoById,
	updateMongoById,
} from "@dokploy/server/services/mongo";
import {
	deployMySql,
	findMySqlById,
	updateMySqlById,
} from "@dokploy/server/services/mysql";
import {
	deployPostgres,
	findPostgresById,
	updatePostgresById,
} from "@dokploy/server/services/postgres";
import {
	deployRedis,
	findRedisById,
	updateRedisById,
} from "@dokploy/server/services/redis";
import { getAccessibleServerIds } from "@dokploy/server/services/server";
import {
	beginServiceMigrationFinalization,
	createPendingServiceMigration,
	deleteServiceMigration,
	finalizeServiceMigration,
	findServiceMigrationById,
	findUnresolvedServiceMigration,
	getMigrationServiceId,
	type MoveableServiceType,
	markServiceMigrationFailed,
	markServiceMigrationReady,
	markServiceMigrationRollingBack,
	updateServiceMigrationProgress,
} from "@dokploy/server/services/service-migration-store";
import {
	startService,
	startServiceRemote,
	stopService,
	stopServiceRemote,
} from "@dokploy/server/utils/docker/utils";
import {
	removeDirectoryCode,
	removeMonitoringDirectory,
} from "@dokploy/server/utils/filesystem/directory";
import {
	removeServiceIdempotent,
	removeVolumeIdempotent,
} from "@dokploy/server/utils/migration/cleanup";
import { TRPCError } from "@trpc/server";
import { resolveServiceMigrationAfterRollback } from "../utils/migration/rollback-outcome";
import {
	countRunningContainers,
	reserveServiceName,
	runtimeExistsOnTarget,
} from "../utils/migration/runtime";
import {
	transferDirectory,
	transferDockerVolume,
} from "../utils/migration/transfer";
import { validateMoveTarget } from "../utils/migration/validate-target-service";
import { sleep } from "../utils/process/execAsync";

export type DatabaseMoveServiceType = Exclude<
	MoveableServiceType,
	"application" | "compose"
>;

interface DatabaseMoveMount {
	type: "bind" | "volume" | "file";
	volumeName: string | null;
	hostPath: string | null;
	filePath: string | null;
	mountPath: string;
}

interface DatabaseMoveEntity {
	appName: string;
	serverId: string | null;
	networkIds: string[] | null;
	applicationStatus: string;
	mounts: DatabaseMoveMount[];
	environment: { project: { organizationId: string } };
}

interface DatabaseMoveAdapter {
	find: (id: string) => Promise<DatabaseMoveEntity & Record<string, unknown>>;
	update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
	deploy: (
		id: string,
		onData?: (data: any) => void,
		allowMigrationId?: string,
	) => Promise<unknown>;
}

const adapters: Record<DatabaseMoveServiceType, DatabaseMoveAdapter> = {
	postgres: {
		find: findPostgresById,
		update: updatePostgresById,
		deploy: deployPostgres,
	},
	mysql: {
		find: findMySqlById,
		update: updateMySqlById,
		deploy: deployMySql,
	},
	mariadb: {
		find: findMariadbById,
		update: updateMariadbById,
		deploy: deployMariadb,
	},
	mongo: {
		find: findMongoById,
		update: updateMongoById,
		deploy: deployMongo,
	},
	redis: {
		find: findRedisById,
		update: updateRedisById,
		deploy: deployRedis,
	},
	libsql: {
		find: findLibsqlById,
		update: updateLibsqlById,
		deploy: deployLibsql,
	},
};

const getFilesDirectory = (appName: string, serverId: string | null) => {
	const { APPLICATIONS_PATH } = paths(!!serverId);
	return path.join(APPLICATIONS_PATH, appName, "files");
};

/** Throws instead of silently returning the error, unlike the underlying `stopService(Remote)` helpers. */
const stopDatabaseService = async (
	appName: string,
	serverId: string | null,
) => {
	const error = serverId
		? await stopServiceRemote(serverId, appName)
		: await stopService(appName);
	if (error) {
		throw error instanceof Error ? error : new Error(String(error));
	}
};

const startDatabaseService = async (
	appName: string,
	serverId: string | null,
) => {
	if (serverId) {
		await startServiceRemote(serverId, appName);
	} else {
		await startService(appName);
	}
};

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2000;

/**
 * Polls until the Swarm service reports at least one running container.
 * Uses `countRunningContainers` (strict, throws on SSH/Docker inspection
 * failure) rather than the docker.ts helpers that swallow errors and return
 * `[]` - an inspection failure here must abort the move (and trigger
 * rollback), not be silently treated as "not running yet" and retried away.
 */
const verifyServiceIsRunning = async (
	appName: string,
	serverId: string | null,
): Promise<boolean> => {
	for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
		const runningCount = await countRunningContainers(
			"service",
			appName,
			serverId,
		);
		if (runningCount > 0) return true;
		await sleep(POLL_INTERVAL_MS);
	}
	return false;
};

/**
 * Polls until no task of the service reports a "running" state. Called
 * right after `stopDatabaseService` - which only *requests* the scale-to-0,
 * asynchronously - to make sure the maintenance window has actually begun
 * before the on-disk data is tar'd up. Without this, a slow-to-drain task
 * could still be writing to the volume while it's being copied.
 *
 * Uses `countRunningContainers` (strict, throws on SSH/Docker inspection
 * failure) rather than the docker.ts helpers that swallow errors and return
 * `[]` - an inspection failure means the true state is unknown, and must
 * never be silently treated as "confirmed stopped", or data that is still
 * being written could be copied out from under the source.
 */
const verifyServiceIsStopped = async (
	appName: string,
	serverId: string | null,
): Promise<boolean> => {
	for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
		const runningCount = await countRunningContainers(
			"service",
			appName,
			serverId,
		);
		if (runningCount === 0) return true;
		await sleep(POLL_INTERVAL_MS);
	}
	return false;
};

/**
 * Full data-migrating cross-server move for a single database service
 * (postgres/mysql/mariadb/mongo/redis/libsql). Stops the source service
 * (maintenance window), streams its volume(s) and file mounts to the
 * target server, points the database record at the target, and
 * deploys/starts it there. The source service and its volumes are left
 * intact (stopped) so `finalizeDatabaseMove` can clean them up once the
 * target has been validated.
 *
 * A durable "pending move" record is persisted BEFORE the source is
 * touched at all: it is both the exclusive lock preventing a second
 * concurrent move for the same database, and the recovery record that lets
 * every failure path below - including one that happens before the source
 * is ever stopped - roll back cleanly.
 */
export const moveDatabaseToServer = async ({
	serviceType,
	id,
	targetServerId,
	session,
}: {
	serviceType: DatabaseMoveServiceType;
	id: string;
	targetServerId: string | null;
	session: { userId: string; activeOrganizationId: string };
}) => {
	const adapter = adapters[serviceType];
	const entity = await adapter.find(id);
	const sourceServerId = entity.serverId;
	const normalizedTargetServerId = targetServerId || null;
	const originalStatus = entity.applicationStatus;
	const originalNetworkIds = entity.networkIds ?? [];

	await validateMoveTarget({
		session,
		sourceServerId,
		targetServerId: normalizedTargetServerId,
	});

	const bindMounts = entity.mounts.filter((mount) => mount.type === "bind");
	if (bindMounts.length > 0) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Databases with custom bind mounts cannot be moved automatically: their host paths are server-specific and may not exist on the target server.",
		});
	}

	const volumeMounts = entity.mounts.filter((mount) => mount.type === "volume");
	for (const mount of volumeMounts) {
		if (!mount.volumeName) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "A volume mount is missing its volume name",
			});
		}
	}
	const fileMounts = entity.mounts.filter((mount) => mount.type === "file");

	// Target runtime name collision preflight: refuse the move outright if a
	// Docker Swarm service with this appName already exists on the target -
	// BEFORE any side effect (before the lock row, before stopping the
	// source). Without this, a same-name collision (e.g. a leftover/orphaned
	// service, or a previous failed move that didn't fully clean up) would
	// only be discovered once the rollback path unconditionally tried to
	// remove "the target service", which could delete something this move
	// never created.
	const targetHasCollidingService = await runtimeExistsOnTarget(
		"service",
		entity.appName,
		normalizedTargetServerId,
	);
	if (targetHasCollidingService) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `A Docker service named "${entity.appName}" already exists on the target server. Refusing to move onto a colliding name - remove or rename it first.`,
		});
	}

	// The durable "pending move" record is the exclusive lock for this move:
	// its partial unique index (scoped to this database's id, status =
	// 'pending') makes a concurrent second move fail atomically at the
	// database level, and it must exist before any side effect below runs so
	// every failure path has something to roll back against.
	const migrationRow = await createPendingServiceMigration({
		serviceType,
		id,
		sourceServerId,
		targetServerId: normalizedTargetServerId,
		volumeNames: volumeMounts.map((mount) => mount.volumeName as string),
		originalNetworkIds,
		originalStatus,
	});

	// Set true right before `stopDatabaseService` is invoked - i.e. before we
	// even know whether the stop command itself, or the subsequent
	// verification poll, will succeed. Rollback's decision to attempt a
	// source restart must key off of this ("did we ask the source to stop?"),
	// never off of "did we *confirm* it stopped" - a verification timeout or
	// an SSH failure partway through `verifyServiceIsStopped` still means the
	// stop was requested and may well have taken effect, so the source must
	// still be restarted on any later failure.
	let sourceStopRequested = false;
	const createdVolumes: string[] = [];
	let createdFilesDirectory = false;
	let ownershipMoved = false;
	// Set only once `adapter.deploy(id)` has returned WITHOUT throwing - i.e.
	// ownership of a target Docker service under `entity.appName` has been
	// positively established, not merely attempted. This must never be
	// widened to "deploy was invoked": the preflight collision check above
	// only proves the name was free *before* the (potentially long-running)
	// volume/file transfer started, not at the moment `adapter.deploy` runs -
	// and some `adapter.deploy` implementations `docker service inspect` the
	// name first and UPDATE whatever they find rather than always creating
	// fresh, so a throw partway through can never be trusted to mean
	// "nothing on the target was touched". If `adapter.deploy` throws before
	// this flips true, rollback must NOT remove anything under this name on
	// the target - safety over automatic cleanup - and the migration is left
	// `failed` with an actionable error for manual/retry cleanup instead.
	let targetServiceCreated = false;

	try {
		// Maintenance window: stop the source and confirm it actually drained
		// before copying, so the data on disk is consistent while we tar it up.
		sourceStopRequested = true;
		await stopDatabaseService(entity.appName, sourceServerId);
		const stopped = await verifyServiceIsStopped(
			entity.appName,
			sourceServerId,
		);
		if (!stopped) {
			throw new Error(
				"The source database did not stop within the expected time - refusing to copy data that may still be changing",
			);
		}
		await updateServiceMigrationProgress(migrationRow.serviceMigrationId, {
			phase: "source_stopped",
		});
		await adapter.update(id, { applicationStatus: "idle" });

		for (const mount of volumeMounts) {
			await transferDockerVolume({
				sourceServerId,
				sourceVolumeName: mount.volumeName as string,
				targetServerId: normalizedTargetServerId,
				targetVolumeName: mount.volumeName as string,
				onTargetCreated: async () => {
					createdVolumes.push(mount.volumeName as string);
					await updateServiceMigrationProgress(
						migrationRow.serviceMigrationId,
						{
							phase: "transferring",
							createdVolumeNames: [...createdVolumes],
						},
					);
				},
			});
		}
		if (fileMounts.length > 0) {
			await transferDirectory({
				sourceServerId,
				sourcePath: getFilesDirectory(entity.appName, sourceServerId),
				targetServerId: normalizedTargetServerId,
				targetPath: getFilesDirectory(entity.appName, normalizedTargetServerId),
				onTargetCreated: async () => {
					createdFilesDirectory = true;
					await updateServiceMigrationProgress(
						migrationRow.serviceMigrationId,
						{
							phase: "transferring",
							targetDirectoryCreated: true,
						},
					);
				},
			});
		}

		await adapter.update(id, {
			serverId: normalizedTargetServerId,
			networkIds: [],
		});
		ownershipMoved = true;
		await updateServiceMigrationProgress(migrationRow.serviceMigrationId, {
			phase: "ownership_moved",
			ownershipMoved: true,
		});

		await reserveServiceName(entity.appName, normalizedTargetServerId);
		targetServiceCreated = true;
		await updateServiceMigrationProgress(migrationRow.serviceMigrationId, {
			phase: "target_reserved",
			targetRuntimeCreated: true,
		});
		await adapter.deploy(id, undefined, migrationRow.serviceMigrationId);

		const isRunning = await verifyServiceIsRunning(
			entity.appName,
			normalizedTargetServerId,
		);
		if (!isRunning) {
			throw new Error(
				"The database did not report a running container on the target server",
			);
		}
		await markServiceMigrationReady({
			serviceMigrationId: migrationRow.serviceMigrationId,
		});
	} catch (error) {
		// Durably mark the row as rolling-back BEFORE attempting any rollback
		// side effect, so a crash mid-rollback leaves clear evidence instead
		// of an orphaned "pending" row that looks like a healthy in-flight
		// move.
		await markServiceMigrationRollingBack(
			migrationRow.serviceMigrationId,
		).catch((markError) => {
			console.error(
				"Failed to mark service migration as rolling back",
				markError,
			);
		});

		// Only ever attempt to remove "the target service" once ownership has
		// been positively established - see `targetServiceCreated`'s doc
		// comment above. If `adapter.deploy` never returned successfully, this
		// migration cannot prove it created (or even touched) anything under
		// this name on the target, so it must NOT be removed here: safety over
		// automatic cleanup. That leaves the row `failed` (below) with an
		// actionable error, and the target artifacts in place for manual
		// inspection/retry, rather than risking deleting a service this
		// migration never owned.
		const cleanupResults = await Promise.allSettled([
			targetServiceCreated
				? removeServiceIdempotent(entity.appName, normalizedTargetServerId)
				: Promise.resolve(),
			...createdVolumes.map((volumeName) =>
				removeVolumeIdempotent(volumeName, normalizedTargetServerId),
			),
			createdFilesDirectory
				? removeDirectoryCode(
						entity.appName,
						normalizedTargetServerId ?? undefined,
					)
				: Promise.resolve(),
		]);
		const cleanupErrors = cleanupResults
			.filter(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			)
			.map((result) => result.reason);
		for (const cleanupError of cleanupErrors) {
			console.error(
				"Failed to clean up target after move rollback",
				cleanupError,
			);
		}

		// Restart the source BEFORE deciding what applicationStatus to report:
		// only once we know it actually came back up (or never needed to,
		// because it was never stopped or was already idle) can the record
		// truthfully claim `originalStatus` again. Reporting `originalStatus`
		// unconditionally would lie about the service's real state if the
		// restart itself failed.
		//
		// Gated on `sourceStopRequested` (the stop was *asked for*), not on
		// having *verified* the stop - a verification timeout or an SSH
		// failure inside `verifyServiceIsStopped` still means
		// `stopDatabaseService` was already invoked and may well have taken
		// effect, so the source must still be restarted here regardless of
		// whether that verification itself ever completed.
		let restartError: unknown = null;
		if (sourceStopRequested && originalStatus !== "idle") {
			try {
				await startDatabaseService(entity.appName, sourceServerId);
				const sourceRunning = await verifyServiceIsRunning(
					entity.appName,
					sourceServerId,
				);
				if (!sourceRunning) {
					throw new Error("The source database did not recover after rollback");
				}
			} catch (err) {
				restartError = err;
				console.error("Failed to restart source database after rollback", err);
			}
		}
		const recoveredApplicationStatus = restartError ? "error" : originalStatus;

		if (ownershipMoved) {
			await adapter.update(id, {
				serverId: sourceServerId,
				networkIds: originalNetworkIds,
				applicationStatus: recoveredApplicationStatus,
			});
		} else {
			await adapter.update(id, {
				applicationStatus: recoveredApplicationStatus,
			});
		}

		// Only deletes the durable lock row once cleanup AND the source
		// restart both fully succeeded; otherwise it is retained as `failed`
		// with a recoverable error describing what needs manual attention.
		const rollbackError = await resolveServiceMigrationAfterRollback({
			serviceMigrationId: migrationRow.serviceMigrationId,
			originalError: error,
			cleanupErrors,
			restartError,
		});
		throw rollbackError;
	}

	return {
		migrationId: migrationRow.serviceMigrationId,
		sourceServerId,
		targetServerId: normalizedTargetServerId,
	};
};

export const getPendingDatabaseMove = async ({
	serviceType,
	id,
}: {
	serviceType: DatabaseMoveServiceType;
	id: string;
}) => {
	const migration = await findUnresolvedServiceMigration(serviceType, id);
	if (!migration) return null;
	return {
		migrationId: migration.serviceMigrationId,
		sourceServerId: migration.sourceServerId,
		targetServerId: migration.targetServerId,
		status: migration.status,
		phase: migration.phase,
		error: migration.error,
	};
};

export const rollbackDatabaseMove = async ({
	serviceType,
	id,
	migrationId,
	session,
}: {
	serviceType: DatabaseMoveServiceType;
	id: string;
	migrationId: string;
	session: { userId: string; activeOrganizationId: string };
}) => {
	const adapter = adapters[serviceType];
	const entity = await adapter.find(id);
	const migration = await findUnresolvedServiceMigration(serviceType, id);
	if (!migration || migration.serviceMigrationId !== migrationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "No matching unresolved migration was found",
		});
	}
	if (migration.status === "finalizing") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Source cleanup has already started; retry finalization instead of rolling back",
		});
	}
	if (migration.sourceServerId || migration.targetServerId) {
		const accessibleIds = await getAccessibleServerIds(session);
		if (
			(migration.sourceServerId &&
				!accessibleIds.has(migration.sourceServerId)) ||
			(migration.targetServerId && !accessibleIds.has(migration.targetServerId))
		) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to access a migration server",
			});
		}
	}

	await markServiceMigrationRollingBack(migrationId);
	const errors: unknown[] = [];
	if (migration.targetRuntimeCreated) {
		await removeServiceIdempotent(
			entity.appName,
			migration.targetServerId,
		).catch((error) => errors.push(error));
	}
	for (const volumeName of migration.createdVolumeNames) {
		await removeVolumeIdempotent(volumeName, migration.targetServerId).catch(
			(error) => errors.push(error),
		);
	}
	if (migration.targetDirectoryCreated) {
		await removeDirectoryCode(
			entity.appName,
			migration.targetServerId ?? undefined,
		).catch((error) => errors.push(error));
	}
	if (migration.ownershipMoved) {
		await adapter
			.update(id, {
				serverId: migration.sourceServerId,
				networkIds: migration.originalNetworkIds,
				applicationStatus: migration.originalStatus ?? "error",
			})
			.catch((error) => errors.push(error));
	}
	if (migration.originalStatus && migration.originalStatus !== "idle") {
		await startDatabaseService(entity.appName, migration.sourceServerId)
			.then(async () => {
				if (
					!(await verifyServiceIsRunning(
						entity.appName,
						migration.sourceServerId,
					))
				) {
					throw new Error("The source database did not recover");
				}
			})
			.catch((error) => errors.push(error));
	}
	if (errors.length > 0) {
		const message = errors
			.map((error) => (error instanceof Error ? error.message : String(error)))
			.join("; ");
		await markServiceMigrationFailed({
			serviceMigrationId: migrationId,
			error: message,
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Migration rollback needs manual attention: ${message}`,
		});
	}
	await deleteServiceMigration(migrationId);
	return true;
};

/**
 * Removes the source runtime/volumes/files for a completed database move,
 * after the caller has validated the target. Requires the persisted
 * "pending" migration record so a client can never trigger cleanup of a
 * server it merely claims was the source. Every cleanup step must succeed
 * (missing resources count as already-clean/success; real errors throw)
 * before the record is marked finalized, so this is always safe to retry.
 */
export const finalizeDatabaseMove = async ({
	serviceType,
	id,
	migrationId,
	session,
}: {
	serviceType: DatabaseMoveServiceType;
	id: string;
	migrationId: string;
	session: { userId: string; activeOrganizationId: string };
}) => {
	const adapter = adapters[serviceType];
	const entity = await adapter.find(id);

	const migration = await findServiceMigrationById(migrationId);

	if (
		!migration ||
		!["ready", "finalizing"].includes(migration.status) ||
		migration.targetServerId !== entity.serverId ||
		getMigrationServiceId(serviceType, migration) !== id
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This move record is not a pending move for this database",
		});
	}

	await beginServiceMigrationFinalization(migrationId);

	if (migration.sourceServerId) {
		const accessibleIds = await getAccessibleServerIds(session);
		if (!accessibleIds.has(migration.sourceServerId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You are not authorized to clean up the source server",
			});
		}
	}

	await removeServiceIdempotent(entity.appName, migration.sourceServerId);

	for (const volumeName of migration.volumeNames) {
		await removeVolumeIdempotent(volumeName, migration.sourceServerId);
	}

	await removeDirectoryCode(
		entity.appName,
		migration.sourceServerId ?? undefined,
	);
	await removeMonitoringDirectory(
		entity.appName,
		migration.sourceServerId ?? undefined,
	);

	await finalizeServiceMigration(migrationId);

	return true;
};
