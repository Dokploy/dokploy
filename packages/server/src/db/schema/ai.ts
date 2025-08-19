import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
export const ai = pgTable("ai", {
	aiId: text("aiId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	apiUrl: text("apiUrl").notNull(),
	apiKey: text("apiKey").notNull(),
	model: text("model").notNull(),
	isEnabled: boolean("isEnabled").notNull().default(true),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }), // Admin ID who created the AI settings
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const aiRelations = relations(ai, ({ one }) => ({
	organization: one(organization, {
		fields: [ai.organizationId],
		references: [organization.id],
	}),
}));

const createSchema = createInsertSchema(ai, {
	name: z.string().min(1, { message: "Name is required" }),
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string(),
	model: z.string().min(1, { message: "Model is required" }),
	isEnabled: z.boolean().optional(),
});

export const apiCreateAi = createSchema
	.pick({
		name: true,
		apiUrl: true,
		apiKey: true,
		model: true,
		isEnabled: true,
	})
	.required();

export const apiUpdateAi = createSchema
	.partial()
	.extend({
		aiId: z.string().min(1),
	})
	.omit({ organizationId: true });

export const deploySuggestionSchema = z.object({
	projectId: z.string().min(1),
	id: z.string().min(1),
	dockerCompose: z.string().min(1),
	envVariables: z.string(),
	serverId: z.string().optional(),
	name: z.string().min(1),
	description: z.string(),
	domains: z
		.array(
			z.object({
				host: z.string().min(1),
				port: z.number().min(1),
				serviceName: z.string().min(1),
			}),
		)
		.optional(),
	configFiles: z
		.array(
			z.object({
				filePath: z.string().min(1),
				content: z.string().min(1),
			}),
		)
		.optional(),
});
