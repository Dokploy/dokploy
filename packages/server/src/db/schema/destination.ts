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
	provider: text("provider"),
	accessKey: text("accessKey").notNull(),
	secretAccessKey: text("secretAccessKey").notNull(),
	bucket: text("bucket").notNull(),
	region: text("region").notNull(),
	endpoint: text("endpoint").notNull(),
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

const createSchema = createInsertSchema(destinations, {
	destinationId: z.string(),
	name: z.string().min(1),
	provider: z.string(),
	accessKey: z.string(),
	bucket: z.string(),
	endpoint: z.string(),
	secretAccessKey: z.string(),
	region: z.string(),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
});

// In Custom mode the user supplies a raw rclone connection string in the
// `endpoint` field (e.g. `:sftp,host=foo,user=bar,pass=baz:`) and only the
// endpoint is required — the S3-specific fields (accessKey, secretAccessKey,
// region, bucket) are unused and may be empty.
type DestinationRefineInput = {
	provider?: string | null;
	endpoint?: string;
	accessKey?: string;
	secretAccessKey?: string;
	bucket?: string;
};

const requireFieldsForProvider = (
	value: DestinationRefineInput,
	ctx: z.RefinementCtx,
) => {
	if (value.provider === "Custom") {
		if (!value.endpoint || value.endpoint.trim().length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["endpoint"],
				message:
					"Connection string is required (e.g. :sftp,host=foo,user=bar:)",
			});
		}
		return;
	}
	for (const field of [
		"accessKey",
		"secretAccessKey",
		"bucket",
		"endpoint",
	] as const) {
		const fieldValue = value[field];
		if (!fieldValue || fieldValue.trim().length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [field],
				message: `${field} is required`,
			});
		}
	}
};

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		additionalFlags: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	})
	.superRefine(requireFieldsForProvider);

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
		additionalFlags: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	})
	.superRefine(requireFieldsForProvider);
