import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";
import { server } from "./server";
import { user } from "./user";

export const migrationStatus = pgEnum("migrationStatus", [
	"pending",
	"validating",
	"pausing_source",
	"backing_up",
	"transferring",
	"recreating",
	"verifying",
	"completed",
	"failed",
	"rolled_back",
]);

export const migrationServiceType = pgEnum("serviceType", [
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
]);

export const serviceMigrations = pgTable("service_migration", {
	migrationId: text("migrationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),

	// Service being migrated
	serviceId: text("serviceId").notNull(),
	serviceType: migrationServiceType("serviceType").notNull(),
	serviceName: text("serviceName").notNull(),

	// Source and target servers
	sourceServerId: text("sourceServerId").references(() => server.serverId, {
		onDelete: "set null",
	}),
	targetServerId: text("targetServerId")
		.notNull()
		.references(() => server.serverId, {
			onDelete: "cascade",
		}),

	// Migration state
	status: migrationStatus("status").notNull().default("pending"),
	currentStep: text("currentStep"),
	progress: text("progress"), // JSON with step-by-step progress
	errorMessage: text("errorMessage"),

	// Metadata
	backupPath: text("backupPath"), // Path to backup on source server
	volumesBackedUp: jsonb("volumesBackedUp").$type<string[]>(), // List of backed up volumes

	// Original configuration (for rollback)
	originalServerId: text("originalServerId"),
	originalReplicas: text("originalReplicas"),

	// Timestamps
	startedAt: text("startedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	completedAt: text("completedAt"),

	// User who initiated
	initiatedBy: text("initiatedBy")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const serviceMigrationsRelations = relations(
	serviceMigrations,
	({ one }) => ({
		sourceServer: one(server, {
			fields: [serviceMigrations.sourceServerId],
			references: [server.serverId],
			relationName: "sourceServer",
		}),
		targetServer: one(server, {
			fields: [serviceMigrations.targetServerId],
			references: [server.serverId],
			relationName: "targetServer",
		}),
		initiator: one(user, {
			fields: [serviceMigrations.initiatedBy],
			references: [user.id],
		}),
	}),
);

const createSchema = createInsertSchema(serviceMigrations, {
	migrationId: z.string(),
	serviceId: z.string(),
	serviceType: z.enum([
		"application",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"compose",
	]),
	serviceName: z.string(),
	targetServerId: z.string(),
	status: z.enum([
		"pending",
		"validating",
		"pausing_source",
		"backing_up",
		"transferring",
		"recreating",
		"verifying",
		"completed",
		"failed",
		"rolled_back",
	]),
	initiatedBy: z.string(),
});

export const apiCreateMigration = createSchema.pick({
	serviceId: true,
	serviceType: true,
	serviceName: true,
	targetServerId: true,
});

export const apiFindOneMigration = createSchema
	.pick({
		migrationId: true,
	})
	.required();

export const apiUpdateMigration = createSchema
	.partial()
	.extend({
		migrationId: z.string(),
	})
	.required({
		migrationId: true,
	});

export type ServiceMigration = typeof serviceMigrations.$inferSelect;
export type NewServiceMigration = typeof serviceMigrations.$inferInsert;
