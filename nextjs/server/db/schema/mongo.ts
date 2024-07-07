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

export const mongo = pgTable("mongo", {
	mongoId: text("mongoId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("mongo"))
		.unique(),
	description: text("description"),
	databaseUser: text("databaseUser").notNull(),
	databasePassword: text("databasePassword").notNull(),
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

export const mongoRelations = relations(mongo, ({ one, many }) => ({
	project: one(projects, {
		fields: [mongo.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
}));

const createSchema = createInsertSchema(mongo, {
	appName: z.string().min(1),
	createdAt: z.string(),
	mongoId: z.string(),
	name: z.string().min(1),
	databasePassword: z.string(),
	databaseUser: z.string().min(1),
	dockerImage: z.string().default("mongo:15"),
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

export const apiCreateMongo = createSchema
	.pick({
		name: true,
		appName: true,
		dockerImage: true,
		projectId: true,
		description: true,
		databaseUser: true,
		databasePassword: true,
	})
	.required();

export const apiFindOneMongo = createSchema
	.pick({
		mongoId: true,
	})
	.required();

export const apiChangeMongoStatus = createSchema
	.pick({
		mongoId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesMongo = createSchema
	.pick({
		mongoId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortMongo = createSchema
	.pick({
		mongoId: true,
		externalPort: true,
	})
	.required();

export const apiDeployMongo = createSchema
	.pick({
		mongoId: true,
	})
	.required();

export const apiUpdateMongo = createSchema.partial().extend({
	mongoId: z.string().min(1),
});

export const apiResetMongo = createSchema
	.pick({
		mongoId: true,
		appName: true,
	})
	.required();
