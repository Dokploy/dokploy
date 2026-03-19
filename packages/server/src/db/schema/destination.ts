import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { backups } from "./backups";

export const destinationTypeValues = ["s3", "sftp", "ftp"] as const;
export type DestinationType = (typeof destinationTypeValues)[number];

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	// Destination type: 's3' | 'sftp' | 'ftp' (defaults to 's3' for backward compat)
	destinationType: text("destinationType").notNull().default("s3"),
	// S3 fields (used when destinationType = 's3')
	provider: text("provider"),
	accessKey: text("accessKey"),
	secretAccessKey: text("secretAccessKey"),
	bucket: text("bucket"),
	region: text("region"),
	endpoint: text("endpoint"),
	// SFTP / FTP fields (used when destinationType = 'sftp' or 'ftp')
	host: text("host"),
	port: text("port"),
	username: text("username"),
	password: text("password"),
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
	destinationType: z.enum(destinationTypeValues),
	provider: z.string().optional(),
	accessKey: z.string().optional(),
	bucket: z.string().optional(),
	endpoint: z.string().optional(),
	secretAccessKey: z.string().optional(),
	region: z.string().optional(),
	host: z.string().optional(),
	port: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
});

const s3Fields = {
	provider: z.string().optional(),
	accessKey: z.string().min(1, "Access Key is required"),
	secretAccessKey: z.string().min(1, "Secret Access Key is required"),
	bucket: z.string().min(1, "Bucket is required"),
	region: z.string().optional().default(""),
	endpoint: z.string().min(1, "Endpoint is required"),
};

const sftpFtpFields = {
	host: z.string().min(1, "Host is required"),
	port: z.string().optional(),
	username: z.string().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
	bucket: z.string().optional().default(""),
};

export const apiCreateDestination = z.discriminatedUnion("destinationType", [
	z.object({
		destinationType: z.literal("s3"),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...s3Fields,
	}),
	z.object({
		destinationType: z.literal("sftp"),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...sftpFtpFields,
	}),
	z.object({
		destinationType: z.literal("ftp"),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...sftpFtpFields,
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

export const apiUpdateDestination = z.discriminatedUnion("destinationType", [
	z.object({
		destinationType: z.literal("s3"),
		destinationId: z.string().min(1),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...s3Fields,
	}),
	z.object({
		destinationType: z.literal("sftp"),
		destinationId: z.string().min(1),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...sftpFtpFields,
	}),
	z.object({
		destinationType: z.literal("ftp"),
		destinationId: z.string().min(1),
		name: z.string().min(1, "Name is required"),
		serverId: z.string().optional(),
		...sftpFtpFields,
	}),
]);
