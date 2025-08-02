import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
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
	registryUrl: text("registryUrl").notNull().default(""),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	registryType: registryType("selfHosted").notNull().default("cloud"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const registryRelations = relations(registry, ({ many }) => ({
	applications: many(applications),
}));

const createSchema = createInsertSchema(registry, {
	registryName: z.string().min(1),
	username: z.string().min(1),
	password: z.string().min(1),
	registryUrl: z.string(),
	organizationId: z.string().min(1),
	registryId: z.string().min(1),
	registryType: z.enum(["cloud"]),
	imagePrefix: z.string().nullable().optional(),
});

export const apiCreateRegistry = createSchema
	.pick({})
	.extend({
		registryName: z.string().min(1),
		username: z.string().min(1),
		password: z.string().min(1),
		registryUrl: z.string(),
		registryType: z.enum(["cloud"]),
		imagePrefix: z.string().nullable().optional(),
	})
	.required()
	.extend({
		serverId: z.string().optional(),
	});

export const apiTestRegistry = createSchema.pick({}).extend({
	registryName: z.string().optional(),
	username: z.string().min(1),
	password: z.string().min(1),
	registryUrl: z.string(),
	registryType: z.enum(["cloud"]),
	imagePrefix: z.string().nullable().optional(),
	serverId: z.string().optional(),
});

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

export const apiUpdateRegistry = createSchema.partial().extend({
	registryId: z.string().min(1),
	serverId: z.string().optional(),
});

export const apiEnableSelfHostedRegistry = createSchema
	.pick({
		registryUrl: true,
		username: true,
		password: true,
	})
	.required();
