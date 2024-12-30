import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ai = pgTable("ai", {
	authId: text("authId").notNull().primaryKey(),
	apiUrl: text("apiUrl").notNull(),
	apiKey: text("apiKey").notNull(),
	model: text("model").notNull(),
	isEnabled: boolean("isEnabled").notNull().default(true),
});

const createSchema = createInsertSchema(ai, {
	apiUrl: z.string().url({ message: "Please enter a valid URL" }),
	apiKey: z.string().min(1, { message: "API Key is required" }),
	model: z.string().min(1, { message: "Model is required" }),
	isEnabled: z.boolean().optional(),
});

export const apiAiSettingsSchema = createSchema
	.pick({
		apiUrl: true,
		apiKey: true,
		model: true,
		isEnabled: true,
	})
	.required();
