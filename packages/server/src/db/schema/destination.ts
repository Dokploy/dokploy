import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
	ADDITIONAL_FLAG_ERROR,
	ADDITIONAL_FLAG_REGEX,
} from "../validations/destination";
import { organization } from "./account";
import { backups } from "./backups";
	
export const destinationTypeEnum = pgEnum("destination_type", ["sftp", "ftp", "s3"]);

export const destinations = pgTable("destination", {
	destinationId: text("destinationId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	credentials: jsonb("credentials")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	additionalFlags: text("additionalFlags").array(),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	type: destinationTypeEnum("type").notNull(),
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
	credentials: z.record(z.string(), z.unknown()).default({}),
	additionalFlags: z
		.array(z.string().regex(ADDITIONAL_FLAG_REGEX, ADDITIONAL_FLAG_ERROR))
		.default([]),
	type: z.enum(["s3", "ftp", "sftp"], {
		error: "Type must be either 's3', 'ftp' or 'sftp'" ,
	}),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		additionalFlags: true,
		type: true,
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
		destinationId: true,
		additionalFlags: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
