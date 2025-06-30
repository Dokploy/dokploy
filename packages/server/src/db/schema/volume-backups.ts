import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { serviceType } from "./mount";
import { applications } from "./application";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { redis } from "./redis";
import { compose } from "./compose";
import { postgres } from "./postgres";
import { mariadb } from "./mariadb";
import { destinations } from "./destination";

export const volumeBackupType = pgEnum("volumeBackupType", ["bind", "volume"]);

export const volumeBackups = pgTable("volume_backup", {
	volumeBackupId: text("volumeBackupId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	type: volumeBackupType("type").notNull().default("volume"),
	volumeName: text("volumeName"),
	hostPath: text("hostPath"),
	prefix: text("prefix").notNull(),
	serviceType: serviceType("serviceType").notNull().default("application"),
	turnOff: boolean("turnOff").notNull().default(false),
	cronExpression: text("cronExpression").notNull(),
	keepLatestCount: integer("keepLatestCount"),
	enabled: boolean("enabled"),
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{
			onDelete: "cascade",
		},
	),
	postgresId: text("postgresId").references(() => postgres.postgresId, {
		onDelete: "cascade",
	}),
	mariadbId: text("mariadbId").references(() => mariadb.mariadbId, {
		onDelete: "cascade",
	}),
	mongoId: text("mongoId").references(() => mongo.mongoId, {
		onDelete: "cascade",
	}),
	mysqlId: text("mysqlId").references(() => mysql.mysqlId, {
		onDelete: "cascade",
	}),
	redisId: text("redisId").references(() => redis.redisId, {
		onDelete: "cascade",
	}),
	composeId: text("composeId").references(() => compose.composeId, {
		onDelete: "cascade",
	}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	destinationId: text("destinationId")
		.notNull()
		.references(() => destinations.destinationId, { onDelete: "cascade" }),
});

export type VolumeBackup = typeof volumeBackups.$inferSelect;

export const volumeBackupsRelations = relations(volumeBackups, ({ one }) => ({
	application: one(applications, {
		fields: [volumeBackups.applicationId],
		references: [applications.applicationId],
	}),
	postgres: one(postgres, {
		fields: [volumeBackups.postgresId],
		references: [postgres.postgresId],
	}),
	mariadb: one(mariadb, {
		fields: [volumeBackups.mariadbId],
		references: [mariadb.mariadbId],
	}),
	mongo: one(mongo, {
		fields: [volumeBackups.mongoId],
		references: [mongo.mongoId],
	}),
	mysql: one(mysql, {
		fields: [volumeBackups.mysqlId],
		references: [mysql.mysqlId],
	}),
	redis: one(redis, {
		fields: [volumeBackups.redisId],
		references: [redis.redisId],
	}),
	compose: one(compose, {
		fields: [volumeBackups.composeId],
		references: [compose.composeId],
	}),
}));

export const createVolumeBackupSchema = createInsertSchema(
	volumeBackups,
).extend({
	volumeName: z.string().min(1),
});

export const updateVolumeBackupSchema = createVolumeBackupSchema.extend({
	volumeBackupId: z.string().min(1),
});

export const apiFindOneVolumeBackup = z.object({
	volumeBackupId: z.string().min(1),
});
