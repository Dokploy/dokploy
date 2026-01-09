import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";

export const userInterfaceSettings = pgTable("userInterfaceSettings", {
	id: text("id")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	// UI Customization
	loginPageImage: text("loginPageImage"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userInterfaceSettingsRelations = relations(
	userInterfaceSettings,
	() => ({}),
);

const createSchema = createInsertSchema(userInterfaceSettings, {
	id: z.string().min(1),
});

export const apiUpdateUserInterfaceSettings = createSchema.partial().extend({
	loginPageImage: z.string().url().optional().nullable(),
});
