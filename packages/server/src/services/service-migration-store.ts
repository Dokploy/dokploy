import { db } from "@dokploy/server/db";
import { serviceMigrations } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export type MoveableServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql"
	| "compose";

const idColumns: Record<MoveableServiceType, AnyPgColumn> = {
	application: serviceMigrations.applicationId,
	postgres: serviceMigrations.postgresId,
	mysql: serviceMigrations.mysqlId,
	mariadb: serviceMigrations.mariadbId,
	mongo: serviceMigrations.mongoId,
	redis: serviceMigrations.redisId,
	libsql: serviceMigrations.libsqlId,
	compose: serviceMigrations.composeId,
};

const buildIdFields = (
	serviceType: MoveableServiceType,
	id: string,
): Record<string, string> => {
	switch (serviceType) {
		case "application":
			return { applicationId: id };
		case "postgres":
			return { postgresId: id };
		case "mysql":
			return { mysqlId: id };
		case "mariadb":
			return { mariadbId: id };
		case "mongo":
			return { mongoId: id };
		case "redis":
			return { redisId: id };
		case "libsql":
			return { libsqlId: id };
		case "compose":
			return { composeId: id };
	}
};

/** Postgres SQLSTATE for `unique_violation`, as surfaced by the `postgres` driver on the `code` property. */
const UNIQUE_VIOLATION_CODE = "23505";

export const isUniqueConstraintViolation = (error: unknown): boolean =>
	Boolean(
		error &&
			typeof error === "object" &&
			"code" in error &&
			(error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE,
	);

/**
 * Creates the durable "pending move" record for a service, BEFORE anything
 * about the move (stopping the source, transferring data) happens. This is
 * the single exclusive lock for the whole move: the partial unique index on
 * this service's id column (scoped to every unresolved status - `pending`,
 * `rolling_back`, `failed`) makes a concurrent second move, or a new move
 * attempt while a previous one is still rolling back or sitting `failed`
 * awaiting manual attention, fail atomically at the database level - there
 * is no separate "check then insert" race window.
 */
export const createPendingServiceMigration = async ({
	serviceType,
	id,
	sourceServerId,
	targetServerId,
	volumeNames = [],
	originalNetworkIds = [],
	originalServiceNetworks = [],
	originalStatus,
}: {
	serviceType: MoveableServiceType;
	id: string;
	sourceServerId: string | null;
	targetServerId: string | null;
	volumeNames?: string[];
	originalNetworkIds?: string[];
	originalServiceNetworks?: Array<{
		serviceName: string;
		networkIds: string[];
		detachDokployNetwork: boolean;
	}>;
	originalStatus?: string;
}) => {
	try {
		const [row] = await db
			.insert(serviceMigrations)
			.values({
				serviceType,
				status: "preparing",
				sourceServerId,
				targetServerId,
				volumeNames,
				originalNetworkIds,
				originalServiceNetworks,
				originalStatus,
				...buildIdFields(serviceType, id),
			})
			.returning();

		if (!row) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to persist the pending move record",
			});
		}
		return row;
	} catch (error) {
		if (isUniqueConstraintViolation(error)) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"A previous move for this service has not been fully resolved (it is still pending, rolling back, or failed and needs manual attention). Finalize or resolve it before starting a new move.",
			});
		}
		throw error;
	}
};

/** Deletes a pending move record - used to roll back the exclusive lock when a move fails before completion. */
export const deleteServiceMigration = async (serviceMigrationId: string) => {
	await db
		.delete(serviceMigrations)
		.where(eq(serviceMigrations.serviceMigrationId, serviceMigrationId));
};

export const findPendingServiceMigration = async (
	serviceType: MoveableServiceType,
	id: string,
) => {
	return db.query.serviceMigrations.findFirst({
		where: and(
			eq(idColumns[serviceType], id),
			inArray(serviceMigrations.status, ["ready", "finalizing"]),
		),
	});
};

export const findUnresolvedServiceMigration = async (
	serviceType: MoveableServiceType,
	id: string,
) =>
	db.query.serviceMigrations.findFirst({
		where: and(
			eq(idColumns[serviceType], id),
			inArray(serviceMigrations.status, [
				"preparing",
				"ready",
				"finalizing",
				"rolling_back",
				"failed",
			]),
		),
	});

export const assertNoUnresolvedServiceMigration = async (
	serviceType: MoveableServiceType,
	id: string,
) => {
	const migration = await findUnresolvedServiceMigration(serviceType, id);
	if (migration) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"This service has an unresolved server migration. Finalize or resolve it before changing its runtime or configuration.",
		});
	}
};

export const hasUnresolvedServerMigration = async (serverId: string) =>
	Boolean(
		await db.query.serviceMigrations.findFirst({
			columns: { serviceMigrationId: true },
			where: and(
				or(
					eq(serviceMigrations.sourceServerId, serverId),
					eq(serviceMigrations.targetServerId, serverId),
				),
				inArray(serviceMigrations.status, [
					"preparing",
					"ready",
					"finalizing",
					"rolling_back",
					"failed",
				]),
			),
		}),
	);

export const findServiceMigrationById = async (serviceMigrationId: string) => {
	return db.query.serviceMigrations.findFirst({
		where: eq(serviceMigrations.serviceMigrationId, serviceMigrationId),
	});
};

/** Marks a move's durable record as finalized. Callers must only call this once every cleanup step for the move has actually succeeded. */
export const finalizeServiceMigration = async (serviceMigrationId: string) => {
	await db
		.update(serviceMigrations)
		.set({ status: "finalized", finalizedAt: new Date().toISOString() })
		.where(eq(serviceMigrations.serviceMigrationId, serviceMigrationId));
};

export const markServiceMigrationReady = async ({
	serviceMigrationId,
	deploymentId,
}: {
	serviceMigrationId: string;
	deploymentId?: string;
}) => {
	const [row] = await db
		.update(serviceMigrations)
		.set({ status: "ready", deploymentId })
		.where(
			and(
				eq(serviceMigrations.serviceMigrationId, serviceMigrationId),
				eq(serviceMigrations.status, "preparing"),
			),
		)
		.returning();
	if (!row) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Migration is no longer in the preparing state",
		});
	}
	return row;
};

export const updateServiceMigrationProgress = async (
	serviceMigrationId: string,
	progress: Partial<{
		phase: string;
		createdVolumeNames: string[];
		targetDirectoryCreated: boolean;
		targetRuntimeCreated: boolean;
		ownershipMoved: boolean;
		deploymentId: string;
	}>,
) => {
	await db
		.update(serviceMigrations)
		.set(progress)
		.where(eq(serviceMigrations.serviceMigrationId, serviceMigrationId));
};

export const beginServiceMigrationFinalization = async (
	serviceMigrationId: string,
) => {
	const migration = await findServiceMigrationById(serviceMigrationId);
	if (!migration || !["ready", "finalizing"].includes(migration.status)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Migration is not ready for source cleanup",
		});
	}
	if (migration.status === "ready") {
		await db
			.update(serviceMigrations)
			.set({ status: "finalizing" })
			.where(
				and(
					eq(serviceMigrations.serviceMigrationId, serviceMigrationId),
					eq(serviceMigrations.status, "ready"),
				),
			);
	}
	return { ...migration, status: "finalizing" as const };
};

/**
 * Marks a failed move's record as "rolling back", durably, BEFORE any
 * rollback side effect (target cleanup, source restart) runs. If the
 * process crashes mid-rollback, this leaves clear evidence that the row
 * needs manual attention instead of an orphaned `pending` row that looks
 * like an active, healthy in-flight move.
 */
export const markServiceMigrationRollingBack = async (
	serviceMigrationId: string,
) => {
	await db
		.update(serviceMigrations)
		.set({ status: "rolling_back" })
		.where(eq(serviceMigrations.serviceMigrationId, serviceMigrationId));
};

/**
 * Marks a move's record as `failed` - rollback was attempted but did NOT
 * fully succeed (the target cleanup and/or the source restart failed) - and
 * records why. The row is retained rather than deleted so the failure is
 * never silently lost. Unlike `pending`, `failed` is not cleared
 * automatically - it stays covered by the partial unique "unresolved" index
 * (alongside `pending`/`rolling_back`) so a new move cannot start for this
 * service until the failure is resolved (either by a retried
 * `resolveServiceMigrationAfterRollback` that fully succeeds and deletes the
 * row, or by manual intervention).
 */
export const markServiceMigrationFailed = async ({
	serviceMigrationId,
	error,
}: {
	serviceMigrationId: string;
	error: string;
}) => {
	await db
		.update(serviceMigrations)
		.set({
			status: "failed",
			error,
			failedAt: new Date().toISOString(),
		})
		.where(eq(serviceMigrations.serviceMigrationId, serviceMigrationId));
};

export const getMigrationServiceId = (
	serviceType: MoveableServiceType,
	migration: typeof serviceMigrations.$inferSelect,
): string | null => {
	switch (serviceType) {
		case "application":
			return migration.applicationId;
		case "postgres":
			return migration.postgresId;
		case "mysql":
			return migration.mysqlId;
		case "mariadb":
			return migration.mariadbId;
		case "mongo":
			return migration.mongoId;
		case "redis":
			return migration.redisId;
		case "libsql":
			return migration.libsqlId;
		case "compose":
			return migration.composeId;
	}
};
