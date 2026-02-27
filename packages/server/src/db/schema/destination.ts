import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinationType = pgEnum("destinationType", [
	"s3",
	"ftp",
	"sftp",
	"google-drive",
	"onedrive",
	"custom-rclone",
]);

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	provider: text("provider"),
	accessKey: text("accessKey").notNull(),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region").notNull(),
	endpoint: text("endpoint").notNull(),
	// Discriminator for the destination backend
	destinationType: destinationType("destinationType")
		.notNull()
		.default("s3"),
	// FTP / SFTP specific fields
	ftpHost: text("ftpHost"),
	ftpPort: text("ftpPort"),
	ftpUser: text("ftpUser"),
	ftpPassword: text("ftpPassword"),
	ftpBasePath: text("ftpBasePath"),
	// Google Drive specific fields
	googleDriveClientId: text("googleDriveClientId"),
	googleDriveClientSecret: text("googleDriveClientSecret"),
	googleDriveToken: text("googleDriveToken"),
	googleDriveFolderId: text("googleDriveFolderId"),
	// OneDrive specific fields
	onedriveClientId: text("onedriveClientId"),
	onedriveClientSecret: text("onedriveClientSecret"),
	onedriveToken: text("onedriveToken"),
	onedriveDriveId: text("onedriveDriveId"),
	onedriveFolderId: text("onedriveFolderId"),
	// Raw rclone config for advanced/custom backends
	rcloneConfig: text("rcloneConfig"),
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
	provider: z.string(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	destinationType: z.enum([
		"s3",
		"ftp",
		"sftp",
		"google-drive",
		"onedrive",
		"custom-rclone",
	]),
	ftpHost: z.string().optional(),
	ftpPort: z.string().optional(),
	ftpUser: z.string().optional(),
	ftpPassword: z.string().optional(),
	ftpBasePath: z.string().optional(),
	googleDriveClientId: z.string().optional(),
	googleDriveClientSecret: z.string().optional(),
	googleDriveToken: z.string().optional(),
	googleDriveFolderId: z.string().optional(),
	onedriveClientId: z.string().optional(),
	onedriveClientSecret: z.string().optional(),
	onedriveToken: z.string().optional(),
	onedriveDriveId: z.string().optional(),
	onedriveFolderId: z.string().optional(),
	rcloneConfig: z.string().optional(),
	rcloneRemotePath: z.string().optional(),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationType: true,
		ftpHost: true,
		ftpPort: true,
		ftpUser: true,
		ftpPassword: true,
		ftpBasePath: true,
		googleDriveClientId: true,
		googleDriveClientSecret: true,
		googleDriveToken: true,
		googleDriveFolderId: true,
		onedriveClientId: true,
		onedriveClientSecret: true,
		onedriveToken: true,
		onedriveDriveId: true,
		onedriveFolderId: true,
		rcloneConfig: true,
		rcloneRemotePath: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

export const apiUpdateDestination = createSchema
	.pick({
		name: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		destinationId: true,
		provider: true,
		destinationType: true,
		ftpHost: true,
		ftpPort: true,
		ftpUser: true,
		ftpPassword: true,
		ftpBasePath: true,
		googleDriveClientId: true,
		googleDriveClientSecret: true,
		googleDriveToken: true,
		googleDriveFolderId: true,
		onedriveClientId: true,
		onedriveClientSecret: true,
		onedriveToken: true,
		onedriveDriveId: true,
		onedriveFolderId: true,
		rcloneConfig: true,
		rcloneRemotePath: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
