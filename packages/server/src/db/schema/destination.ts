import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	// Destination type: "s3" | "ftp" | "sftp"
	destinationType: text("destinationType").notNull().default("s3"),
	// S3-specific fields
	provider: text("provider"),
	accessKey: text("accessKey").notNull().default(""),
	secretAccessKey: text("secretAccessKey").notNull().default(""),
	bucket: text("bucket").notNull().default(""),
	region: text("region").notNull().default(""),
	endpoint: text("endpoint").notNull().default(""),
	// FTP/SFTP-specific fields
	ftpHost: text("ftpHost"),
	ftpPort: integer("ftpPort"),
	ftpUser: text("ftpUser"),
	ftpPassword: text("ftpPassword"),
	ftpBasePath: text("ftpBasePath"),
	sftpPrivateKey: text("sftpPrivateKey"),
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
	destinationType: z.string(),
	provider: z.string().optional(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	ftpHost: z.string().optional(),
	ftpPort: z.number().optional(),
	ftpUser: z.string().optional(),
	ftpPassword: z.string().optional(),
	ftpBasePath: z.string().optional(),
	sftpPrivateKey: z.string().optional(),
});

// S3 destination schema
const s3DestinationSchema = z.object({
	destinationType: z.literal("s3"),
	name: z.string().min(1),
	provider: z.string().min(1, "Provider is required"),
	accessKey: z.string().min(1, "Access Key is required"),
	secretAccessKey: z.string().min(1, "Secret Access Key is required"),
	bucket: z.string().min(1, "Bucket is required"),
	region: z.string(),
	endpoint: z.string().min(1, "Endpoint is required"),
	serverId: z.string().optional(),
	// FTP fields not needed
	ftpHost: z.string().optional(),
	ftpPort: z.number().optional(),
	ftpUser: z.string().optional(),
	ftpPassword: z.string().optional(),
	ftpBasePath: z.string().optional(),
});

// FTP destination schema
const ftpDestinationSchema = z.object({
	destinationType: z.literal("ftp"),
	name: z.string().min(1),
	ftpHost: z.string().min(1, "FTP Host is required"),
	ftpPort: z.number().default(21),
	ftpUser: z.string().min(1, "FTP Username is required"),
	ftpPassword: z.string().min(1, "FTP Password is required"),
	ftpBasePath: z.string().optional(),
	serverId: z.string().optional(),
	// S3 fields not needed
	provider: z.string().optional(),
	accessKey: z.string().optional(),
	secretAccessKey: z.string().optional(),
	bucket: z.string().optional(),
	region: z.string().optional(),
	endpoint: z.string().optional(),
});

// SFTP destination schema
const sftpDestinationSchema = z.object({
	destinationType: z.literal("sftp"),
	name: z.string().min(1),
	ftpHost: z.string().min(1, "SFTP Host is required"),
	ftpPort: z.number().default(22),
	ftpUser: z.string().min(1, "SFTP Username is required"),
	ftpPassword: z.string().optional(),
	sftpPrivateKey: z.string().optional(),
	ftpBasePath: z.string().optional(),
	serverId: z.string().optional(),
	// S3 fields not needed
	provider: z.string().optional(),
	accessKey: z.string().optional(),
	secretAccessKey: z.string().optional(),
	bucket: z.string().optional(),
	region: z.string().optional(),
	endpoint: z.string().optional(),
});

export const apiCreateDestination = z.discriminatedUnion("destinationType", [
	s3DestinationSchema,
	ftpDestinationSchema,
	sftpDestinationSchema,
]);

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiUpdateDestination = z.discriminatedUnion("destinationType", [
	s3DestinationSchema.extend({ destinationId: z.string().min(1) }),
	ftpDestinationSchema.extend({ destinationId: z.string().min(1) }),
	sftpDestinationSchema.extend({ destinationId: z.string().min(1) }),
]);
