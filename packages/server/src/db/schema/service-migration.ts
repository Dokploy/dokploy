import { relations, sql } from "drizzle-orm";
import {
	boolean,
	jsonb,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { libsql } from "./libsql";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { serviceType } from "./mount";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";
import { server } from "./server";

/**
 * Databases (postgres/mysql/mariadb/mongo/redis/libsql) and Compose don't
 * have a durable, non-prunable place to persist "cross-server move"
 * metadata: databases have no deployments table at all, and Compose's
 * deployments table is subject to retention pruning, which would silently
 * strand a "pending cleanup" move. This table is that durable, non-prunable
 * record: one row per in-flight (or finalized) cross-server move, keyed to
 * whichever service it belongs to. It is also the single point where
 * "only one pending move per service" is enforced atomically, via the
 * partial unique indexes below - the insert (not an app-level check) is the
 * one and only lock.
 *
 * Status lifecycle:
 * - `pending`: the move is in flight, or has succeeded and is awaiting an
 *   explicit source cleanup (`finalize*Move`).
 * - `finalized`: the move succeeded and the source was cleaned up.
 * - `rolling_back`: a move failed and rollback (target cleanup + source
 *   restart) is in progress. Set durably before any rollback side effect
 *   runs, so a crash mid-rollback still leaves evidence instead of an
 *   orphaned "pending" row nobody is acting on.
 * - `failed`: rollback was attempted but did NOT fully succeed - either
 *   the target cleanup or the source restart (or both) failed. The row is
 *   retained (never deleted) with `error` describing what needs manual
 *   attention, instead of silently losing the record.
 *
 * `pending`, `rolling_back`, and `failed` are all "unresolved" states for
 * this purpose and are every one of them covered by the partial unique
 * indexes below - not just `pending`. A `failed` row means the previous
 * move's target cleanup and/or source restart did NOT fully succeed, so
 * the target/source may still hold artifacts or be in an inconsistent
 * state; letting a second move start anyway (the target/source collision
 * preflight checks alone are not enough - they only look at runtime
 * existence, not at whatever a half-rolled-back move left behind, such as
 * a stopped-but-not-restarted source) would compound the failure. The lock
 * is only released once the row reaches `finalized`, or is deleted after a
 * rollback that fully succeeded (see `resolveServiceMigrationAfterRollback`)
 * - never merely by reaching `failed`.
 */
export const serviceMigrationStatus = pgEnum("serviceMigrationStatus", [
	"preparing",
	"ready",
	"finalizing",
	"finalized",
	"rolling_back",
	"failed",
]);

export const serviceMigrations = pgTable(
	"service_migration",
	{
		serviceMigrationId: text("serviceMigrationId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		serviceType: serviceType("serviceType").notNull(),
		status: serviceMigrationStatus("status").notNull().default("preparing"),
		sourceServerId: text("sourceServerId").references(() => server.serverId, {
			onDelete: "restrict",
		}),
		targetServerId: text("targetServerId").references(() => server.serverId, {
			onDelete: "restrict",
		}),
		applicationId: text("applicationId").references(
			() => applications.applicationId,
			{ onDelete: "restrict" },
		),
		postgresId: text("postgresId").references(() => postgres.postgresId, {
			onDelete: "restrict",
		}),
		mysqlId: text("mysqlId").references(() => mysql.mysqlId, {
			onDelete: "restrict",
		}),
		mariadbId: text("mariadbId").references(() => mariadb.mariadbId, {
			onDelete: "restrict",
		}),
		mongoId: text("mongoId").references(() => mongo.mongoId, {
			onDelete: "restrict",
		}),
		redisId: text("redisId").references(() => redis.redisId, {
			onDelete: "restrict",
		}),
		libsqlId: text("libsqlId").references(() => libsql.libsqlId, {
			onDelete: "restrict",
		}),
		composeId: text("composeId").references(() => compose.composeId, {
			onDelete: "restrict",
		}),
		/**
		 * The named Docker volumes discovered/transferred for this move,
		 * persisted at the time of the move (before the source is torn down).
		 * Needed because Compose's source mounts can no longer be
		 * rediscovered from running containers once the source stack/project
		 * has been removed - `finalizeComposeMove` must use this list rather
		 * than re-inspecting containers that may no longer exist.
		 */
		volumeNames: text("volumeNames").array().notNull().default([]),
		originalNetworkIds: text("originalNetworkIds")
			.array()
			.notNull()
			.default([]),
		originalServiceNetworks: jsonb("originalServiceNetworks")
			.$type<
				Array<{
					serviceName: string;
					networkIds: string[];
					detachDokployNetwork: boolean;
				}>
			>()
			.notNull()
			.default([]),
		originalStatus: text("originalStatus"),
		deploymentId: text("deploymentId"),
		phase: text("phase").notNull().default("created"),
		createdVolumeNames: text("createdVolumeNames")
			.array()
			.notNull()
			.default([]),
		targetDirectoryCreated: boolean("targetDirectoryCreated")
			.notNull()
			.default(false),
		targetRuntimeCreated: boolean("targetRuntimeCreated")
			.notNull()
			.default(false),
		ownershipMoved: boolean("ownershipMoved").notNull().default(false),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		finalizedAt: text("finalizedAt"),
		/**
		 * Set when the row transitions to `rolling_back`/`failed`. Human-
		 * readable description of what went wrong during the move and/or its
		 * rollback (e.g. "source restart failed: ..."), so a `failed` row is
		 * actionable instead of just an inert marker.
		 */
		error: text("error"),
		/** Set when the row transitions to `failed`. */
		failedAt: text("failedAt"),
	},
	(table) => [
		// The exclusive lock for a service: a partial unique index per
		// service-id column, scoped to every UNRESOLVED status
		// (`pending`, `rolling_back`, `failed` - not just `pending`), so all
		// service types can share this table while each still gets an
		// exclusive lock keyed to its own id. Enforced atomically by the
		// database itself (not just an application-level check-then-insert,
		// which would race) - see the status-lifecycle doc comment above for
		// why `failed` must also be covered.
		uniqueIndex("service_migration_pending_postgres_idx")
			.on(table.postgresId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_mysql_idx")
			.on(table.mysqlId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_mariadb_idx")
			.on(table.mariadbId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_mongo_idx")
			.on(table.mongoId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_redis_idx")
			.on(table.redisId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_libsql_idx")
			.on(table.libsqlId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_compose_idx")
			.on(table.composeId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
		uniqueIndex("service_migration_pending_application_idx")
			.on(table.applicationId)
			.where(
				sql`${table.status} IN ('preparing', 'ready', 'finalizing', 'rolling_back', 'failed')`,
			),
	],
);

export type ServiceMigration = typeof serviceMigrations.$inferSelect;

export const serviceMigrationsRelations = relations(
	serviceMigrations,
	({ one }) => ({
		sourceServer: one(server, {
			fields: [serviceMigrations.sourceServerId],
			references: [server.serverId],
			relationName: "serviceMigrationSourceServer",
		}),
		targetServer: one(server, {
			fields: [serviceMigrations.targetServerId],
			references: [server.serverId],
			relationName: "serviceMigrationTargetServer",
		}),
		application: one(applications, {
			fields: [serviceMigrations.applicationId],
			references: [applications.applicationId],
		}),
		postgres: one(postgres, {
			fields: [serviceMigrations.postgresId],
			references: [postgres.postgresId],
		}),
		mysql: one(mysql, {
			fields: [serviceMigrations.mysqlId],
			references: [mysql.mysqlId],
		}),
		mariadb: one(mariadb, {
			fields: [serviceMigrations.mariadbId],
			references: [mariadb.mariadbId],
		}),
		mongo: one(mongo, {
			fields: [serviceMigrations.mongoId],
			references: [mongo.mongoId],
		}),
		redis: one(redis, {
			fields: [serviceMigrations.redisId],
			references: [redis.redisId],
		}),
		libsql: one(libsql, {
			fields: [serviceMigrations.libsqlId],
			references: [libsql.libsqlId],
		}),
		compose: one(compose, {
			fields: [serviceMigrations.composeId],
			references: [compose.composeId],
		}),
	}),
);

const schema = createInsertSchema(serviceMigrations, {
	serviceType: z.enum(serviceType.enumValues),
	status: z.enum([
		"preparing",
		"ready",
		"finalizing",
		"finalized",
		"rolling_back",
		"failed",
	]),
	sourceServerId: z.string().nullable(),
	targetServerId: z.string().nullable(),
	volumeNames: z.array(z.string()),
	originalNetworkIds: z.array(z.string()),
	createdVolumeNames: z.array(z.string()),
});

export const apiCreateServiceMigration = schema.omit({
	serviceMigrationId: true,
	createdAt: true,
	finalizedAt: true,
	error: true,
	failedAt: true,
});
