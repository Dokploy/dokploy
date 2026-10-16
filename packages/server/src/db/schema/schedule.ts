import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { applications } from "./application";
import { compose } from "./compose";
import { deployments } from "./deployment";
import { libsql } from "./libsql";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { redis } from "./redis";
import { server } from "./server";
import { generateAppName } from "./utils";
export const shellTypes = pgEnum("shellType", ["bash", "sh"]);

export const databaseScheduleTypes = [
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
] as const;

export type DatabaseScheduleType = (typeof databaseScheduleTypes)[number];

export const isDatabaseScheduleType = (
	type: string | null | undefined,
): type is DatabaseScheduleType =>
	databaseScheduleTypes.some((value) => value === type);

export const databaseScheduleIdColumns = {
	postgres: "postgresId",
	mysql: "mysqlId",
	mariadb: "mariadbId",
	mongo: "mongoId",
	redis: "redisId",
	libsql: "libsqlId",
} as const;

export const scheduleType = pgEnum("scheduleType", [
	"application",
	"compose",
	"server",
	"dokploy-server",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
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
	postgresId: text("postgresId").references(() => postgres.postgresId, {
		onDelete: "cascade",
	}),
	mysqlId: text("mysqlId").references(() => mysql.mysqlId, {
		onDelete: "cascade",
	}),
	mariadbId: text("mariadbId").references(() => mariadb.mariadbId, {
		onDelete: "cascade",
	}),
	mongoId: text("mongoId").references(() => mongo.mongoId, {
		onDelete: "cascade",
	}),
	redisId: text("redisId").references(() => redis.redisId, {
		onDelete: "cascade",
	}),
	libsqlId: text("libsqlId").references(() => libsql.libsqlId, {
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
export type ScheduleType = Schedule["scheduleType"];

export const getDatabaseScheduleId = (schedule: Partial<Schedule>) =>
	isDatabaseScheduleType(schedule.scheduleType)
		? schedule[databaseScheduleIdColumns[schedule.scheduleType]]
		: null;

// Prevent schedules from being bound to multiple services or to a database
// other than the one identified by scheduleType.
export const isValidDatabaseScheduleTarget = (input: Partial<Schedule>) => {
	const linkedTargets = Object.values(databaseScheduleIdColumns).filter(
		(column) => Boolean(input[column]),
	);
	if (!isDatabaseScheduleType(input.scheduleType)) {
		return linkedTargets.length === 0;
	}
	return (
		linkedTargets.length === 1 &&
		Boolean(input[databaseScheduleIdColumns[input.scheduleType]]) &&
		!input.applicationId &&
		!input.composeId &&
		!input.serverId &&
		!input.organizationId
	);
};

export const schedulesRelations = relations(schedules, ({ one, many }) => ({
	application: one(applications, {
		fields: [schedules.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [schedules.composeId],
		references: [compose.composeId],
	}),
	postgres: one(postgres, {
		fields: [schedules.postgresId],
		references: [postgres.postgresId],
	}),
	mysql: one(mysql, {
		fields: [schedules.mysqlId],
		references: [mysql.mysqlId],
	}),
	mariadb: one(mariadb, {
		fields: [schedules.mariadbId],
		references: [mariadb.mariadbId],
	}),
	mongo: one(mongo, {
		fields: [schedules.mongoId],
		references: [mongo.mongoId],
	}),
	redis: one(redis, {
		fields: [schedules.redisId],
		references: [redis.redisId],
	}),
	libsql: one(libsql, {
		fields: [schedules.libsqlId],
		references: [libsql.libsqlId],
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
	scheduleType: z.enum(scheduleType.enumValues),
});

export const updateScheduleSchema = createScheduleSchema.extend({
	scheduleId: z.string().min(1),
});
