import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { server } from "./server";
import { APP_NAME_MESSAGE, APP_NAME_REGEX, generateAppName } from "./utils";
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
	description: text("description"),
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
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	enabled: boolean("enabled").notNull().default(true),
	timezone: text("timezone"),
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
	organization: one(organization, {
		fields: [schedules.organizationId],
		references: [organization.id],
	}),
	deployments: many(deployments),
}));

export const createScheduleSchema = createInsertSchema(schedules, {
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
});

export const updateScheduleSchema = createScheduleSchema.extend({
	scheduleId: z.string().min(1),
});
