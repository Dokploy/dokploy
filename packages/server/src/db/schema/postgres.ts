import { relations } from "drizzle-orm";
import { integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { backups } from "./backups";
import { mounts } from "./mount";
import { projects } from "./project";
import { server } from "./server";
import {
	applicationStatus,
	type HealthCheckSwarm,
	HealthCheckSwarmSchema,
	type LabelsSwarm,
	LabelsSwarmSchema,
	type NetworkSwarm,
	NetworkSwarmSchema,
	type PlacementSwarm,
	PlacementSwarmSchema,
	type RestartPolicySwarm,
	RestartPolicySwarmSchema,
	type ServiceModeSwarm,
	ServiceModeSwarmSchema,
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import { generateAppName } from "./utils";

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
	memoryReservation: text("memoryReservation"),
	externalPort: integer("externalPort"),
	memoryLimit: text("memoryLimit"),
	cpuReservation: text("cpuReservation"),
	cpuLimit: text("cpuLimit"),
	applicationStatus: applicationStatus("applicationStatus")
		.notNull()
		.default("idle"),

	healthCheckSwarm: json("healthCheckSwarm").$type<HealthCheckSwarm>(),
	restartPolicySwarm: json("restartPolicySwarm").$type<RestartPolicySwarm>(),
	placementSwarm: json("placementSwarm").$type<PlacementSwarm>(),
	updateConfigSwarm: json("updateConfigSwarm").$type<UpdateConfigSwarm>(),
	rollbackConfigSwarm: json("rollbackConfigSwarm").$type<UpdateConfigSwarm>(),
	modeSwarm: json("modeSwarm").$type<ServiceModeSwarm>(),
	labelsSwarm: json("labelsSwarm").$type<LabelsSwarm>(),
	networkSwarm: json("networkSwarm").$type<NetworkSwarm[]>(),
	replicas: integer("replicas").default(1).notNull(),
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

export const postgresRelations = relations(postgres, ({ one, many }) => ({
	project: one(projects, {
		fields: [postgres.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
	server: one(server, {
		fields: [postgres.serverId],
		references: [server.serverId],
	}),
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
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	projectId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
	createdAt: z.string(),
	description: z.string().optional(),
	serverId: z.string().optional(),
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
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
		serverId: true,
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

export const apiUpdatePostgres = createSchema
	.partial()
	.extend({
		postgresId: z.string().min(1),
	})
	.omit({ serverId: true });

export const apiRebuildPostgres = createSchema
	.pick({
		postgresId: true,
	})
	.required();
