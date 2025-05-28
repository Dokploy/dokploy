import { relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { generateAppName } from ".";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { destinations } from "./destination";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { users_temp } from "./user";
export const databaseType = pgEnum("databaseType", [
	"postgres",
	"mariadb",
	"mysql",
	"mongo",
	"web-server",
]);

export const backupType = pgEnum("backupType", ["database", "compose"]);

export const backups = pgTable("backup", {
	backupId: text("backupId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("backup"))
		.unique(),
	schedule: text("schedule").notNull(),
	enabled: boolean("enabled"),
	database: text("database").notNull(),
	prefix: text("prefix").notNull(),
	serviceName: text("serviceName"),
	destinationId: text("destinationId")
		.notNull()
		.references(() => destinations.destinationId, { onDelete: "cascade" }),
	keepLatestCount: integer("keepLatestCount"),
	backupType: backupType("backupType").notNull().default("database"),
	databaseType: databaseType("databaseType").notNull(),
	composeId: text("composeId").references(
		(): AnyPgColumn => compose.composeId,
		{
			onDelete: "cascade",
		},
	),
	postgresId: text("postgresId").references(
		(): AnyPgColumn => postgres.postgresId,
		{
			onDelete: "cascade",
		},
	),
	mariadbId: text("mariadbId").references(
		(): AnyPgColumn => mariadb.mariadbId,
		{
			onDelete: "cascade",
		},
	),
	mysqlId: text("mysqlId").references((): AnyPgColumn => mysql.mysqlId, {
		onDelete: "cascade",
	}),
	mongoId: text("mongoId").references((): AnyPgColumn => mongo.mongoId, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => users_temp.id),
	// Only for compose backups
	metadata: jsonb("metadata").$type<
		| {
				postgres?: {
					databaseUser: string;
				};
				mariadb?: {
					databaseUser: string;
					databasePassword: string;
				};
				mongo?: {
					databaseUser: string;
					databasePassword: string;
				};
				mysql?: {
					databaseRootPassword: string;
				};
		  }
		| undefined
	>(),
});

export const backupsRelations = relations(backups, ({ one, many }) => ({
	destination: one(destinations, {
		fields: [backups.destinationId],
		references: [destinations.destinationId],
	}),
	postgres: one(postgres, {
		fields: [backups.postgresId],
		references: [postgres.postgresId],
	}),
	mariadb: one(mariadb, {
		fields: [backups.mariadbId],
		references: [mariadb.mariadbId],
	}),
	mysql: one(mysql, {
		fields: [backups.mysqlId],
		references: [mysql.mysqlId],
	}),
	mongo: one(mongo, {
		fields: [backups.mongoId],
		references: [mongo.mongoId],
	}),
	user: one(users_temp, {
		fields: [backups.userId],
		references: [users_temp.id],
	}),
	compose: one(compose, {
		fields: [backups.composeId],
		references: [compose.composeId],
	}),
	deployments: many(deployments),
}));

const createSchema = createInsertSchema(backups, {
	backupId: z.string(),
	destinationId: z.string(),
	enabled: z.boolean().optional(),
	prefix: z.string().min(1),
	database: z.string().min(1),
	schedule: z.string(),
	keepLatestCount: z.number().optional(),
	databaseType: z.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"]),
	postgresId: z.string().optional(),
	mariadbId: z.string().optional(),
	mysqlId: z.string().optional(),
	mongoId: z.string().optional(),
	userId: z.string().optional(),
	metadata: z.any().optional(),
});

export const apiCreateBackup = createSchema.pick({
	schedule: true,
	enabled: true,
	prefix: true,
	destinationId: true,
	keepLatestCount: true,
	database: true,
	mariadbId: true,
	mysqlId: true,
	postgresId: true,
	mongoId: true,
	databaseType: true,
	userId: true,
	backupType: true,
	composeId: true,
	serviceName: true,
	metadata: true,
});

export const apiFindOneBackup = createSchema
	.pick({
		backupId: true,
	})
	.required();

export const apiRemoveBackup = createSchema
	.pick({
		backupId: true,
	})
	.required();

export const apiUpdateBackup = createSchema
	.pick({
		schedule: true,
		enabled: true,
		prefix: true,
		backupId: true,
		destinationId: true,
		database: true,
		keepLatestCount: true,
		serviceName: true,
		metadata: true,
		databaseType: true,
	})
	.required();

export const apiRestoreBackup = z.object({
	databaseId: z.string(),
	databaseType: z.enum(["postgres", "mysql", "mariadb", "mongo", "web-server"]),
	backupType: z.enum(["database", "compose"]),
	databaseName: z.string().min(1),
	backupFile: z.string().min(1),
	destinationId: z.string().min(1),
	metadata: z
		.object({
			serviceName: z.string().optional(),
			postgres: z
				.object({
					databaseUser: z.string(),
				})
				.optional(),
			mariadb: z
				.object({
					databaseUser: z.string(),
					databasePassword: z.string(),
				})
				.optional(),
			mongo: z
				.object({
					databaseUser: z.string(),
					databasePassword: z.string(),
				})
				.optional(),
			mysql: z
				.object({
					databaseRootPassword: z.string(),
				})
				.optional(),
		})
		.optional(),
});
