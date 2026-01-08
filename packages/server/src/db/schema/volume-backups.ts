import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { destinations } from "./destination";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { serviceType } from "./mount";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";
import { generateAppName } from "./utils";

export const volumeBackups = pgTable("volume_backup", {
	volumeBackupId: text("volumeBackupId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	volumeName: text("volumeName").notNull(),
	prefix: text("prefix").notNull(),
	serviceType: serviceType("serviceType").notNull().default("application"),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("volumeBackup")),
	serviceName: text("serviceName"),
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

export const volumeBackupsRelations = relations(
	volumeBackups,
	({ one, many }) => ({
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
		destination: one(destinations, {
			fields: [volumeBackups.destinationId],
			references: [destinations.destinationId],
		}),
		deployments: many(deployments),
	}),
);

export const createVolumeBackupSchema = createInsertSchema(volumeBackups).omit({
	volumeBackupId: true,
});

export const updateVolumeBackupSchema = createVolumeBackupSchema.extend({
	volumeBackupId: z.string().min(1),
});

export const apiFindOneVolumeBackup = z.object({
	volumeBackupId: z.string().min(1),
});
