import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";

export const schedules = pgTable("schedule", {
	scheduleId: text("scheduleId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	cronExpression: text("cronExpression").notNull(),
	command: text("command").notNull(),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, {
			onDelete: "cascade",
		}),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const schedulesRelations = relations(schedules, ({ one }) => ({
	application: one(applications, {
		fields: [schedules.applicationId],
		references: [applications.applicationId],
	}),
}));

export const createScheduleSchema = createInsertSchema(schedules, {
	name: z.string().min(1),
	cronExpression: z.string().min(1),
	command: z.string().min(1),
	applicationId: z.string().min(1),
});
