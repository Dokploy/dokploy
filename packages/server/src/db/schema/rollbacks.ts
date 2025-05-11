import { relations } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";

export const rollbacks = pgTable("rollback", {
	rollbackId: text("rollbackId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	env: text("env"),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, {
			onDelete: "cascade",
		}),
	version: serial(),
	image: text("image"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export type Rollback = typeof rollbacks.$inferSelect;

export const rollbacksRelations = relations(rollbacks, ({ one }) => ({
	application: one(applications, {
		fields: [rollbacks.applicationId],
		references: [applications.applicationId],
	}),
}));

export const createRollbackSchema = createInsertSchema(rollbacks).extend({
	appName: z.string().min(1),
});

export const updateRollbackSchema = createRollbackSchema.extend({
	rollbackId: z.string().min(1),
});

export const apiFindOneRollback = z.object({
	rollbackId: z.string().min(1),
});
