import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { admins } from "./admin";
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
	//   maybe it can be null
	endpoint: text("endpoint").notNull(),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
});

export const destinationsRelations = relations(
	destinations,
	({ many, one }) => ({
		backups: many(backups),
		admin: one(admins, {
			fields: [destinations.adminId],
			references: [admins.adminId],
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
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});

export const apiFindOneDestination = createSchema
	.pick({
		destinationId: true,
	})
	.required();

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
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
