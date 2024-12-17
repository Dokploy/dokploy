import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { backups } from "./backups";
import { mounts } from "./mount";
import { projects } from "./project";
import { server } from "./server";
import { applicationStatus } from "./shared";
import { generateAppName } from "./utils";

export const mariadb = pgTable("mariadb", {
	mariadbId: text("mariadbId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("mariadb"))
		.unique(),
	description: text("description"),
	databaseName: text("databaseName").notNull(),
	databaseUser: text("databaseUser").notNull(),
	databasePassword: text("databasePassword").notNull(),
	databaseRootPassword: text("rootPassword").notNull(),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	env: text("env"),
	// RESOURCES
	memoryReservation: integer("memoryReservation"),
	memoryLimit: integer("memoryLimit"),
	cpuReservation: integer("cpuReservation"),
	cpuLimit: integer("cpuLimit"),
	//
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
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const mariadbRelations = relations(mariadb, ({ one, many }) => ({
	project: one(projects, {
		fields: [mariadb.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
	server: one(server, {
		fields: [mariadb.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(mariadb, {
	mariadbId: z.string(),
	name: z.string().min(1),
	appName: z.string().min(1),
	createdAt: z.string(),
	databaseName: z.string().min(1),
	databaseUser: z.string().min(1),
	databasePassword: z.string(),
	databaseRootPassword: z.string().optional(),
	dockerImage: z.string().default("mariadb:6"),
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
	serverId: z.string().optional(),
});

export const apiCreateMariaDB = createSchema
	.pick({
		name: true,
		appName: true,
		dockerImage: true,
		databaseRootPassword: true,
		projectId: true,
		description: true,
		databaseName: true,
		databaseUser: true,
		databasePassword: true,
		serverId: true,
	})
	.required();

export const apiFindOneMariaDB = createSchema
	.pick({
		mariadbId: true,
	})
	.required();

export const apiChangeMariaDBStatus = createSchema
	.pick({
		mariadbId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesMariaDB = createSchema
	.pick({
		mariadbId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortMariaDB = createSchema
	.pick({
		mariadbId: true,
		externalPort: true,
	})
	.required();

export const apiDeployMariaDB = createSchema
	.pick({
		mariadbId: true,
	})
	.required();

export const apiResetMariadb = createSchema
	.pick({
		mariadbId: true,
		appName: true,
	})
	.required();

export const apiUpdateMariaDB = createSchema
	.partial()
	.extend({
		mariadbId: z.string().min(1),
	})
	.omit({ serverId: true });
