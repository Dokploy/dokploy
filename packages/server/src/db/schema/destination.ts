import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
	CUSTOM_DESTINATION_PROVIDER,
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

const validateDestination = <
	T extends {
		provider?: string | null;
		accessKey: string;
		secretAccessKey: string;
		region: string;
		bucket: string;
		endpoint: string;
	},
>(
	data: T,
	ctx: z.RefinementCtx,
) => {
	const isCustomDestination = data.provider === CUSTOM_DESTINATION_PROVIDER;

	if (isCustomDestination) {
		if (!data.endpoint.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Remote root is required for custom destinations",
				path: ["endpoint"],
			});
		}

		if (!data.bucket.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Destination path is required for custom destinations",
				path: ["bucket"],
			});
		}

		return;
	}

	if (!data.accessKey.trim()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Access Key Id is required",
			path: ["accessKey"],
		});
	}

	if (!data.secretAccessKey.trim()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Secret Access Key is required",
			path: ["secretAccessKey"],
		});
	}

	if (!data.region.trim()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Region is required",
			path: ["region"],
		});
	}
};

const destinationInputSchema = createSchema
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
	.superRefine(validateDestination);

export const apiCreateDestination = destinationInputSchema;

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
	.superRefine(validateDestination);
