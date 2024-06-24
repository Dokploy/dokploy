import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { applicationStatus } from "./shared";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./project";
import { backups } from "./backups";
import { mounts } from "./mount";
import { generateAppName } from "./utils";
import { generatePassword } from "@/templates/utils";

export const mysql = pgTable("mysql", {
	mysqlId: text("mysqlId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("mysql"))
		.unique(),
	description: text("description"),
	databaseName: text("databaseName").notNull(),
	databaseUser: text("databaseUser").notNull(),
	databasePassword: text("databasePassword").notNull(),
	databaseRootPassword: text("rootPassword").notNull(),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	env: text("env"),
	memoryReservation: integer("memoryReservation"),
	memoryLimit: integer("memoryLimit"),
	cpuReservation: integer("cpuReservation"),
	cpuLimit: integer("cpuLimit"),
	externalPort: integer("externalPort"),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
});

export const mysqlRelations = relations(mysql, ({ one, many }) => ({
	project: one(projects, {
		fields: [mysql.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
}));

const createSchema = createInsertSchema(mysql, {
	mysqlId: z.string(),
	appName: z.string().min(1),
	createdAt: z.string(),
	name: z.string().min(1),
	databaseName: z.string().min(1),
	databaseUser: z.string().min(1),
	databasePassword: z.string(),
	databaseRootPassword: z.string().optional(),
	dockerImage: z.string().default("mysql:8"),
	command: z.string().optional(),
	env: z.string().optional(),
	memoryReservation: z.number().optional(),
	memoryLimit: z.number().optional(),
	cpuReservation: z.number().optional(),
	cpuLimit: z.number().optional(),
	projectId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
	description: z.string().optional(),
});

export const apiCreateMySql = createSchema
	.pick({
		name: true,
		appName: true,
		dockerImage: true,
		projectId: true,
		description: true,
		databaseName: true,
		databaseUser: true,
		databasePassword: true,
		databaseRootPassword: true,
	})
	.required();

export const apiFindOneMySql = createSchema
	.pick({
		mysqlId: true,
	})
	.required();

export const apiChangeMySqlStatus = createSchema
	.pick({
		mysqlId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesMySql = createSchema
	.pick({
		mysqlId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortMySql = createSchema
	.pick({
		mysqlId: true,
		externalPort: true,
	})
	.required();

export const apiResetMysql = createSchema
	.pick({
		mysqlId: true,
		appName: true,
	})
	.required();

export const apiDeployMySql = createSchema
	.pick({
		mysqlId: true,
	})
	.required();

export const apiUpdateMySql = createSchema.partial().extend({
	mysqlId: z.string().min(1),
});
