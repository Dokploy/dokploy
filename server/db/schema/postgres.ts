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

export const postgres = pgTable("postgres", {
	postgresId: text("postgresId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("postgres"))
		.unique(),
	databaseName: text("databaseName").notNull(),
	databaseUser: text("databaseUser").notNull(),
	databasePassword: text("databasePassword").notNull(),
	description: text("description"),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	env: text("env"),
	memoryReservation: integer("memoryReservation"),
	externalPort: integer("externalPort"),
	memoryLimit: integer("memoryLimit"),
	cpuReservation: integer("cpuReservation"),
	cpuLimit: integer("cpuLimit"),
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

export const postgresRelations = relations(postgres, ({ one, many }) => ({
	project: one(projects, {
		fields: [postgres.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
}));

const createSchema = createInsertSchema(postgres, {
	postgresId: z.string(),
	name: z.string().min(1),
	databasePassword: z.string(),
	databaseName: z.string().min(1),
	databaseUser: z.string().min(1),
	dockerImage: z.string().default("postgres:15"),
	command: z.string().optional(),
	env: z.string().optional(),
	memoryReservation: z.number().optional(),
	memoryLimit: z.number().optional(),
	cpuReservation: z.number().optional(),
	cpuLimit: z.number().optional(),
	projectId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
	createdAt: z.string(),
	description: z.string().optional(),
});

export const apiCreatePostgres = createSchema
	.pick({
		name: true,
		appName: true,
		databaseName: true,
		databaseUser: true,
		databasePassword: true,
		dockerImage: true,
		projectId: true,
		description: true,
	})
	.required();

export const apiFindOnePostgres = createSchema
	.pick({
		postgresId: true,
	})
	.required();

export const apiChangePostgresStatus = createSchema
	.pick({
		postgresId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesPostgres = createSchema
	.pick({
		postgresId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortPostgres = createSchema
	.pick({
		postgresId: true,
		externalPort: true,
	})
	.required();

export const apiDeployPostgres = createSchema
	.pick({
		postgresId: true,
	})
	.required();

export const apiResetPostgres = createSchema
	.pick({
		postgresId: true,
		appName: true,
	})
	.required();

export const apiUpdatePostgres = createSchema.partial().extend({
	postgresId: z.string().min(1),
});
