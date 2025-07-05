import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { server } from "./server";
import { users_temp } from "./user";
import { generateAppName } from "./utils";
export const shellTypes = pgEnum("shellType", ["bash", "sh"]);

export const scheduleType = pgEnum("scheduleType", [
	"application",
	"compose",
	"server",
	"dokploy-server",
]);

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
	serviceName: text("serviceName"),
	shellType: shellTypes("shellType").notNull().default("bash"),
	scheduleType: scheduleType("scheduleType").notNull().default("application"),
	command: text("command").notNull(),
	script: text("script"),
	applicationId: text("applicationId").references(
		() => applications.applicationId,
		{
			onDelete: "cascade",
		},
	),
	composeId: text("composeId").references(() => compose.composeId, {
		onDelete: "cascade",
	}),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => users_temp.id, {
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
	compose: one(compose, {
		fields: [schedules.composeId],
		references: [compose.composeId],
	}),
	server: one(server, {
		fields: [schedules.serverId],
		references: [server.serverId],
	}),
	user: one(users_temp, {
		fields: [schedules.userId],
		references: [users_temp.id],
	}),
	deployments: many(deployments),
}));

export const createScheduleSchema = createInsertSchema(schedules);

export const updateScheduleSchema = createScheduleSchema.extend({
	scheduleId: z.string().min(1),
});
