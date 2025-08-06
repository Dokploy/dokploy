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
	memoryReservation: text("memoryReservation"),
	memoryLimit: text("memoryLimit"),
	cpuReservation: text("cpuReservation"),
	cpuLimit: text("cpuLimit"),
	externalPort: integer("externalPort"),
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

export const mysqlRelations = relations(mysql, ({ one, many }) => ({
	project: one(projects, {
		fields: [mysql.projectId],
		references: [projects.projectId],
	}),
	backups: many(backups),
	mounts: many(mounts),
	server: one(server, {
		fields: [mysql.serverId],
		references: [server.serverId],
	}),
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
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	projectId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
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
		serverId: true,
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

export const apiUpdateMySql = createSchema
	.partial()
	.extend({
		mysqlId: z.string().min(1),
	})
	.omit({ serverId: true });

export const apiRebuildMysql = createSchema
	.pick({
		mysqlId: true,
	})
	.required();
