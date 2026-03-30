import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
} from "../validations/destination";
import { organization } from "./account";
import { backups } from "./backups";

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	destinationType: text("destinationType").default("s3").notNull(),
	// S3 fields
	provider: text("provider"),
	accessKey: text("accessKey"),
	secretAccessKey: text("secretAccessKey"),
	bucket: text("bucket"),
	region: text("region"),
	endpoint: text("endpoint"),
	additionalFlags: text("additionalFlags").array(),
	// SFTP/FTP fields
	host: text("host"),
	port: text("port"),
	username: text("username"),
	password: text("password"),
	remotePath: text("remotePath"),
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

// Discriminated union for destination creation based on type
const s3ConfigSchema = z.object({
	provider: z.string().optional(),
	accessKey: z.string().min(1, "Access key is required for S3"),
	secretAccessKey: z.string().min(1, "Secret access key is required for S3"),
	bucket: z.string().min(1, "Bucket is required for S3"),
	region: z.string().min(1, "Region is required for S3"),
	endpoint: z.string().min(1, "Endpoint is required for S3"),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
});

const sftpConfigSchema = z.object({
	host: z.string().min(1, "Host is required for SFTP"),
	port: z.string().default("22"),
	username: z.string().min(1, "Username is required for SFTP"),
	password: z.string().min(1, "Password is required for SFTP"),
	remotePath: z.string().min(1, "Remote path is required for SFTP"),
});

const ftpConfigSchema = z.object({
	host: z.string().min(1, "Host is required for FTP"),
	port: z.string().default("21"),
	username: z.string().min(1, "Username is required for FTP"),
	password: z.string().min(1, "Password is required for FTP"),
	remotePath: z.string().min(1, "Remote path is required for FTP"),
});

export const apiCreateDestination = z.discriminatedUnion("destinationType", [
	z.object({
		name: z.string().min(1),
		destinationType: z.literal("s3"),
		serverId: z.string().optional(),
	}).and(s3ConfigSchema),
	z.object({
		name: z.string().min(1),
		destinationType: z.literal("sftp"),
		serverId: z.string().optional(),
	}).and(sftpConfigSchema),
	z.object({
		name: z.string().min(1),
		destinationType: z.literal("ftp"),
		serverId: z.string().optional(),
	}).and(ftpConfigSchema),
]).default({ name: "", destinationType: "s3", accessKey: "", secretAccessKey: "", bucket: "", region: "", endpoint: "" });

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiUpdateDestination = z.discriminatedUnion("destinationType", [
	z.object({
		destinationId: z.string().min(1),
		name: z.string().min(1),
		destinationType: z.literal("s3"),
		serverId: z.string().optional(),
	}).and(s3ConfigSchema),
	z.object({
		destinationId: z.string().min(1),
		name: z.string().min(1),
		destinationType: z.literal("sftp"),
		serverId: z.string().optional(),
	}).and(sftpConfigSchema),
	z.object({
		destinationId: z.string().min(1),
		name: z.string().min(1),
		destinationType: z.literal("ftp"),
		serverId: z.string().optional(),
	}).and(ftpConfigSchema),
]);
