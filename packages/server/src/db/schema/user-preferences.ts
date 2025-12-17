import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, json } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { user } from "./user";

export const userPreferences = pgTable("user_preferences", {
	preferenceId: text("preferenceId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	hiddenSidebarItems: json("hiddenSidebarItems").$type<string[]>().default([]),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: timestamp("updatedAt", { mode: "date" }).$onUpdate(
		() => new Date(),
	),
});

export const userPreferencesRelations = relations(
	userPreferences,
	({ one }) => ({
		user: one(user, {
			fields: [userPreferences.userId],
			references: [user.id],
		}),
	}),
);
