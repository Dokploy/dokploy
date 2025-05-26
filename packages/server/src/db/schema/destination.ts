import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
	provider: text("provider"),
	type: text("type").notNull().default('s3'),
	rcloneConfig: text("rcloneConfig"),
	accessKey: text("accessKey"),
	secretAccessKey: text("secretAccessKey"),
	bucket: text("bucket"),
	region: text("region"),
	endpoint: text("endpoint"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	rcloneConfigFilePath: text("rcloneConfigFilePath"),
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
	provider: z.string().optional(),
	type: z.string().min(1),
	rcloneConfig: z.string().optional(),
	accessKey: z.string().optional(),
	bucket: z.string().optional(),
	endpoint: z.string().optional(),
	secretAccessKey: z.string().optional(),
	region: z.string().optional(),
	rcloneConfigFilePath: z.string().optional(),
});

export const apiCreateDestination = createSchema
	.pick({
		name: true,
		provider: true,
		type: true,
		rcloneConfig: true,
		accessKey: true,
		bucket: true,
		region: true,
		endpoint: true,
		secretAccessKey: true,
		rcloneConfigFilePath: true,
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
		type: true,
		rcloneConfig: true,
		rcloneConfigFilePath: true,
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});
