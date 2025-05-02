import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { deployments } from "./deployment";
import { generateAppName } from "./utils";

export const schedules = pgTable("schedule", {
	scheduleId: text("scheduleId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	cronExpression: text("cronExpression").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("schedule")),
	command: text("command").notNull(),
	applicationId: text("applicationId")
		.notNull()
		.references(() => applications.applicationId, {
			onDelete: "cascade",
		}),
	enabled: boolean("enabled").notNull().default(true),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export type Schedule = typeof schedules.$inferSelect;

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
	application: one(applications, {
		fields: [schedules.applicationId],
		references: [applications.applicationId],
	}),
	deployments: many(deployments),
}));

export const createScheduleSchema = createInsertSchema(schedules, {
	name: z.string().min(1),
	cronExpression: z.string().min(1),
	command: z.string().min(1),
	applicationId: z.string().min(1),
});
