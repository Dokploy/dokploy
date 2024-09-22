import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mounts } from "./mount";
import { projects } from "./project";
import { server } from "./server";
import { applicationStatus } from "./shared";
import { generateAppName } from "./utils";

export const redis = pgTable("redis", {
	redisId: text("redisId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("redis"))
		.unique(),
	description: text("description"),
	databasePassword: text("password").notNull(),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	env: text("env"),
	memoryReservation: integer("memoryReservation"),
	memoryLimit: integer("memoryLimit"),
	cpuReservation: integer("cpuReservation"),
	cpuLimit: integer("cpuLimit"),
	externalPort: integer("externalPort"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const redisRelations = relations(redis, ({ one, many }) => ({
	project: one(projects, {
		fields: [redis.projectId],
		references: [projects.projectId],
	}),
	mounts: many(mounts),
	server: one(server, {
		fields: [redis.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(redis, {
	redisId: z.string(),
	appName: z.string().min(1),
	createdAt: z.string(),
	name: z.string().min(1),
	databasePassword: z.string(),
	dockerImage: z.string().default("redis:8"),
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

export const apiCreateRedis = createSchema
	.pick({
		name: true,
		appName: true,
		databasePassword: true,
		dockerImage: true,
		projectId: true,
		description: true,
		serverId: true,
	})
	.required();

export const apiFindOneRedis = createSchema
	.pick({
		redisId: true,
	})
	.required();

export const apiChangeRedisStatus = createSchema
	.pick({
		redisId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesRedis = createSchema
	.pick({
		redisId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortRedis = createSchema
	.pick({
		redisId: true,
		externalPort: true,
	})
	.required();

export const apiDeployRedis = createSchema
	.pick({
		redisId: true,
	})
	.required();

export const apiResetRedis = createSchema
	.pick({
		redisId: true,
		appName: true,
	})
	.required();

export const apiUpdateRedis = createSchema
	.partial()
	.extend({
		redisId: z.string().min(1),
	})
	.omit({ serverId: true });
