import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinationTypeEnum = pgEnum("destinationType", [
	"s3",
	"sftp",
	"rclone",
]);

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	destinationType: destinationTypeEnum("destinationType")
		.notNull()
		.default("s3"),
	// S3 fields (used when destinationType = "s3")
	provider: text("provider"),
	accessKey: text("accessKey").notNull().default(""),
	secretAccessKey: text("secretAccessKey").notNull().default(""),
	bucket: text("bucket").notNull().default(""),
	region: text("region").notNull().default(""),
	endpoint: text("endpoint").notNull().default(""),
	// SFTP fields (used when destinationType = "sftp")
	sftpHost: text("sftpHost"),
	sftpPort: integer("sftpPort"),
	sftpUsername: text("sftpUsername"),
	sftpPassword: text("sftpPassword"),
	sftpKeyPath: text("sftpKeyPath"),
	sftpRemotePath: text("sftpRemotePath"),
	// Generic rclone config (used when destinationType = "rclone")
	rcloneConfig: text("rcloneConfig"),
	rcloneRemoteName: text("rcloneRemoteName"),
	rcloneRemotePath: text("rcloneRemotePath"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const destinationsRelations = relations(
	destinations,
	({ many, one }) => ({
		backups: many(backups),
		organization: one(organization, {
			fields: [destinations.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	destinationType: z.enum(["s3", "sftp", "rclone"]).default("s3"),
	provider: z.string().optional(),
	accessKey: z.string().optional(),
	bucket: z.string().optional(),
	endpoint: z.string().optional(),
	secretAccessKey: z.string().optional(),
	region: z.string().optional(),
	sftpHost: z.string().optional(),
	sftpPort: z.number().optional(),
	sftpUsername: z.string().optional(),
	sftpPassword: z.string().optional(),
	sftpKeyPath: z.string().optional(),
	sftpRemotePath: z.string().optional(),
	rcloneConfig: z.string().optional(),
	rcloneRemoteName: z.string().optional(),
	rcloneRemotePath: z.string().optional(),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		destinationType: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		sftpHost: true,
		sftpPort: true,
		sftpUsername: true,
		sftpPassword: true,
		sftpKeyPath: true,
		sftpRemotePath: true,
		rcloneConfig: true,
		rcloneRemoteName: true,
		rcloneRemotePath: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});

export const apiFindOneDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = createSchema
	.pick({
		name: true,
		destinationType: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationId: true,
		provider: true,
		sftpHost: true,
		sftpPort: true,
		sftpUsername: true,
		sftpPassword: true,
		sftpKeyPath: true,
		sftpRemotePath: true,
		rcloneConfig: true,
		rcloneRemoteName: true,
		rcloneRemotePath: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
