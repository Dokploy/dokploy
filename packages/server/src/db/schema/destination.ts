import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
	getRcloneDestinationType,
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

type DestinationInput = {
	provider: string | null;
	accessKey: string;
	secretAccessKey: string;
	bucket: string;
	region: string;
	endpoint: string;
};

const addRequiredIssue = (
	ctx: z.RefinementCtx,
	path: keyof DestinationInput,
	message: string,
) => {
	ctx.addIssue({
		code: "custom",
		path: [path],
		message,
	});
};

const validateDestinationInput = (
	data: DestinationInput,
	ctx: z.RefinementCtx,
) => {
	if (!data.provider?.trim()) {
		addRequiredIssue(ctx, "provider", "Provider is required");
		return;
	}

	const destinationType = getRcloneDestinationType(data.provider ?? "");

	if (destinationType === "s3") {
		if (!data.accessKey.trim()) {
			addRequiredIssue(ctx, "accessKey", "Access key is required");
		}
		if (!data.secretAccessKey.trim()) {
			addRequiredIssue(ctx, "secretAccessKey", "Secret access key is required");
		}
		if (!data.bucket.trim()) {
			addRequiredIssue(ctx, "bucket", "Bucket is required");
		}
		if (!data.endpoint.trim()) {
			addRequiredIssue(ctx, "endpoint", "Endpoint is required");
		}
		return;
	}

	if (destinationType === "ftp" || destinationType === "sftp") {
		if (!data.endpoint.trim()) {
			addRequiredIssue(ctx, "endpoint", "Host is required");
		}
		if (!data.accessKey.trim()) {
			addRequiredIssue(ctx, "accessKey", "Username is required");
		}
		if (!data.secretAccessKey.trim()) {
			addRequiredIssue(ctx, "secretAccessKey", "Password is required");
		}
		if (data.region.trim()) {
			const port = Number(data.region);
			if (!Number.isInteger(port) || port < 1 || port > 65535) {
				addRequiredIssue(ctx, "region", "Port must be between 1 and 65535");
			}
		}
		return;
	}

	if (!data.endpoint.trim()) {
		addRequiredIssue(ctx, "endpoint", "OAuth token JSON is required");
		return;
	}

	try {
		JSON.parse(data.endpoint);
	} catch {
		addRequiredIssue(ctx, "endpoint", "OAuth token must be valid JSON");
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
		provider: z.string().min(1),
		serverId: z.string().optional(),
	})
	.superRefine(validateDestinationInput);

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
		provider: z.string().min(1),
		serverId: z.string().optional(),
	})
	.superRefine(validateDestinationInput);
