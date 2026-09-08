import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
	destinationType: text("destinationType").notNull().default("s3"),
	provider: text("provider"),
	accessKey: text("accessKey"),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region"),
	endpoint: text("endpoint"),
	additionalFlags: text("additionalFlags").array(),
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

export const s3DestinationSchema = z.object({
	destinationType: z.literal("s3").default("s3"),
	name: z.string().min(1, "Name is required"),
	provider: z.string().min(1, "Provider is required"),
	accessKey: z.string().min(1, "Access Key Id is required"),
	secretAccessKey: z.string().min(1, "Secret Access Key is required"),
	bucket: z.string().min(1, "Bucket is required"),
	region: z.string().default(""),
	endpoint: z.string().min(1, "Endpoint is required"),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
	serverId: z.string().optional(),
});

export const azureBlobDestinationSchema = z
	.object({
		destinationType: z.literal("azure_blob").default("azure_blob"),
		name: z.string().min(1, "Name is required"),
		provider: z.enum(["account_key", "sas_url"]).default("account_key"),
		accessKey: z.string().optional().default(""),
		secretAccessKey: z.string().min(1, "Account Key or SAS URL is required"),
		bucket: z.string().min(1, "Container name is required"),
		region: z.string().optional().default(""),
		endpoint: z.string().optional().default(""),
		additionalFlags: z
			.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
			.default([]),
		serverId: z.string().optional(),
	})
	.refine(
		(data) => {
			if (data.provider === "account_key") {
				return !!data.accessKey && data.accessKey.trim().length > 0;
			}
			return true;
		},
		{
			message: "Storage Account Name is required when using Account Key",
			path: ["accessKey"],
		},
	);

export const destinationSchema = z.object({
	name: z.string().min(1, "Name is required"),
	destinationType: z.preprocess(
		(val) => (val === "az_bs" ? "azure_blob" : val),
		z.enum(["s3", "azure_blob"]).default("s3"),
	),
	provider: z.string().min(1, "Provider is required").default("AWS"),
	accessKey: z.string().optional().default(""),
	secretAccessKey: z
		.string()
		.min(1, "Secret Access Key / Account Key / SAS URL is required"),
	bucket: z.string().min(1, "Bucket / Container is required"),
	region: z.string().optional().default(""),
	endpoint: z.string().optional().default(""),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
	serverId: z.string().optional(),
});

export const apiCreateDestination = destinationSchema;

export const apiFindOneDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiRemoveDestination = z.object({
	destinationId: z.string().min(1),
});

export const apiUpdateDestination = destinationSchema.extend({
	destinationId: z.string().min(1),
});
