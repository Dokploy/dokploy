import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { relations, sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { auth } from "./auth";
import { admins } from "./admin";
import { z } from "zod";
import { applications } from "./application";
/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const registryType = pgEnum("RegistryType", ["selfHosted", "cloud"]);

export const registry = pgTable("registry", {
	registryId: text("registryId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	registryName: text("registryName").notNull(),
	imagePrefix: text("imagePrefix"),
	username: text("username").notNull(),
	password: text("password").notNull(),
	registryUrl: text("registryUrl").notNull(),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	registryType: registryType("selfHosted").notNull().default("cloud"),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
});

export const registryRelations = relations(registry, ({ one, many }) => ({
	admin: one(admins, {
		fields: [registry.adminId],
		references: [admins.adminId],
	}),
	applications: many(applications),
}));

const createSchema = createInsertSchema(registry, {
	registryName: z.string().min(1),
	username: z.string().min(1),
	password: z.string().min(1),
	registryUrl: z.string().min(1),
	adminId: z.string().min(1),
	registryId: z.string().min(1),
	registryType: z.enum(["selfHosted", "cloud"]),
	imagePrefix: z.string().nullable().optional(),
});

export const apiCreateRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().min(1),
		username: z.string().min(1),
		password: z.string().min(1),
		registryUrl: z.string(),
		registryType: z.enum(["selfHosted", "cloud"]),
		imagePrefix: z.string().nullable().optional(),
	})
	.required();

export const apiRemoveRegistry = createSchema
	.pick({
		registryId: true,
	})
	.required();

export const apiFindOneRegistry = createSchema
	.pick({
		registryId: true,
	})
	.required();

export const apiUpdateRegistry = createSchema
	.pick({
		password: true,
		registryName: true,
		username: true,
		registryUrl: true,
		registryId: true,
	})
	.required();

export const apiEnableSelfHostedRegistry = createSchema
	.pick({
		registryUrl: true,
		username: true,
		password: true,
	})
	.required();
