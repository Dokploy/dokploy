import { relations } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export type DestinationType = "s3" | "sftp" | "ftp" | "gdrive";

export interface SFTPConfig {
	host: string;
	port: string;
	user: string;
	password: string;
	remotePath: string;
}

export interface FTPConfig {
	host: string;
	port: string;
	user: string;
	password: string;
	remotePath: string;
	explicitTls: boolean;
}

export interface GDriveConfig {
	serviceAccountKey: string;
	rootFolderId?: string;
}

export type ProviderConfig = SFTPConfig | FTPConfig | GDriveConfig;

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	// S3 / S3-compatible fields (kept for backwards compatibility)
	provider: text("provider"),
	accessKey: text("accessKey").notNull().default(""),
	secretAccessKey: text("secretAccessKey").notNull().default(""),
	bucket: text("bucket").notNull().default(""),
	region: text("region").notNull().default(""),
	endpoint: text("endpoint").notNull().default(""),
	// Multi-provider fields
	destinationType: text("destinationType")
		.$type<DestinationType>()
		.notNull()
		.default("s3"),
	providerConfig: jsonb("providerConfig").$type<ProviderConfig>(),
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

const sftpConfigSchema = z.object({
	host: z.string().min(1),
	port: z.string().default("22"),
	user: z.string().min(1),
	password: z.string().min(1),
	remotePath: z.string().default("/"),
});

const ftpConfigSchema = z.object({
	host: z.string().min(1),
	port: z.string().default("21"),
	user: z.string().min(1),
	password: z.string().min(1),
	remotePath: z.string().default("/"),
	explicitTls: z.boolean().default(false),
});

const gdriveConfigSchema = z.object({
	serviceAccountKey: z.string().min(1),
	rootFolderId: z.string().optional(),
});

export const providerConfigSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("sftp") }).merge(sftpConfigSchema),
	z.object({ type: z.literal("ftp") }).merge(ftpConfigSchema),
	z.object({ type: z.literal("gdrive") }).merge(gdriveConfigSchema),
]);

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	provider: z.string(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	destinationType: z.enum(["s3", "sftp", "ftp", "gdrive"]).default("s3"),
});

export const apiCreateDestination = z.discriminatedUnion("destinationType", [
	// S3 / S3-compatible
	z.object({
		destinationType: z.literal("s3"),
		name: z.string().min(1),
		provider: z.string().min(1),
		accessKey: z.string().min(1),
		secretAccessKey: z.string().min(1),
		bucket: z.string().min(1),
		region: z.string(),
		endpoint: z.string().min(1),
		serverId: z.string().optional(),
	}),
	// SFTP
	z.object({
		destinationType: z.literal("sftp"),
		name: z.string().min(1),
		providerConfig: sftpConfigSchema,
		serverId: z.string().optional(),
	}),
	// FTP
	z.object({
		destinationType: z.literal("ftp"),
		name: z.string().min(1),
		providerConfig: ftpConfigSchema,
		serverId: z.string().optional(),
	}),
	// Google Drive
	z.object({
		destinationType: z.literal("gdrive"),
		name: z.string().min(1),
		providerConfig: gdriveConfigSchema,
		serverId: z.string().optional(),
	}),
]);

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = z
	.discriminatedUnion("destinationType", [
		z.object({
			destinationType: z.literal("s3"),
			destinationId: z.string().min(1),
			name: z.string().min(1),
			provider: z.string().min(1),
			accessKey: z.string().min(1),
			secretAccessKey: z.string().min(1),
			bucket: z.string().min(1),
			region: z.string(),
			endpoint: z.string().min(1),
			serverId: z.string().optional(),
		}),
		z.object({
			destinationType: z.literal("sftp"),
			destinationId: z.string().min(1),
			name: z.string().min(1),
			providerConfig: sftpConfigSchema,
			serverId: z.string().optional(),
		}),
		z.object({
			destinationType: z.literal("ftp"),
			destinationId: z.string().min(1),
			name: z.string().min(1),
			providerConfig: ftpConfigSchema,
			serverId: z.string().optional(),
		}),
		z.object({
			destinationType: z.literal("gdrive"),
			destinationId: z.string().min(1),
			name: z.string().min(1),
			providerConfig: gdriveConfigSchema,
			serverId: z.string().optional(),
		}),
	]);
