import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const templateRegistry = pgTable("template_registry", {
	templateRegistryId: text("templateRegistryId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	baseUrl: text("baseUrl").notNull(),
	isDefault: boolean("isDefault").notNull().default(false),
	isEnabled: boolean("isEnabled").notNull().default(true),
	lastSyncAt: text("lastSyncAt"),
	templateCount: text("templateCount"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const templateRegistryRelations = relations(
	templateRegistry,
	({ one }) => ({
		organization: one(organization, {
			fields: [templateRegistry.organizationId],
			references: [organization.id],
		}),
	}),
);

const createSchema = createInsertSchema(templateRegistry, {
	name: z.string().min(1, "Name is required"),
	baseUrl: z.string().url("Must be a valid URL"),
	description: z.string().optional(),
	isEnabled: z.boolean().optional(),
	isDefault: z.boolean().optional(),
});

export const apiCreateTemplateRegistry = createSchema
	.pick({
		name: true,
		baseUrl: true,
		description: true,
	})
	.required({
		name: true,
		baseUrl: true,
	});

export const apiUpdateTemplateRegistry = createSchema.partial().extend({
	templateRegistryId: z.string().min(1),
});

export const apiFindOneTemplateRegistry = z.object({
	templateRegistryId: z.string().min(1),
});

export const apiRemoveTemplateRegistry = z.object({
	templateRegistryId: z.string().min(1),
});

export const apiToggleTemplateRegistry = z.object({
	templateRegistryId: z.string().min(1),
	isEnabled: z.boolean(),
});

