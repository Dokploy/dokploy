import { relations } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { cloudStorageDestination } from "./cloud-storage-destination";

export const cloudStorageBackup = pgTable("cloud_storage_backup", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id").notNull(),
	cloudStorageDestinationId: uuid("cloud_storage_destination_id")
		.notNull()
		.references(() => cloudStorageDestination.id),
	schedule: text("schedule").notNull(),
	enabled: boolean("enabled").notNull().default(true),
	databaseType: text("database_type").notNull(),
	prefix: text("prefix"),
	database: text("database"),
	postgresId: text("postgres_id"),
	mysqlId: text("mysql_id"),
	mariadbId: text("mariadb_id"),
	mongoId: text("mongo_id"),
	keepLatestCount: integer("keep_latest_count"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cloudStorageBackupRelations = relations(
	cloudStorageBackup,
	({ one }) => ({
		cloudStorageDestination: one(cloudStorageDestination, {
			fields: [cloudStorageBackup.cloudStorageDestinationId],
			references: [cloudStorageDestination.id],
		}),
	}),
);
