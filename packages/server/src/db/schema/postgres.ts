import { relations } from "drizzle-orm";
import { bigint, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { backups } from "./backups";
import { environments } from "./environment";
import { mounts } from "./mount";
import { server } from "./server";
import {
	applicationStatus,
	type EndpointSpecSwarm,
	EndpointSpecSwarmSchema,
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
	type UlimitsSwarm,
	UlimitsSwarmSchema,
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import { APP_NAME_MESSAGE, APP_NAME_REGEX, generateAppName } from "./utils";

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
	args: text("args").array(),
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
	stopGracePeriodSwarm: bigint("stopGracePeriodSwarm", { mode: "bigint" }),
	endpointSpecSwarm: json("endpointSpecSwarm").$type<EndpointSpecSwarm>(),
	ulimitsSwarm: json("ulimitsSwarm").$type<UlimitsSwarm>(),
	replicas: integer("replicas").default(1).notNull(),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),

	environmentId: text("environmentId")
		.notNull()
		.references(() => environments.environmentId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const postgresRelations = relations(postgres, ({ one, many }) => ({
	environment: one(environments, {
		fields: [postgres.environmentId],
		references: [environments.environmentId],
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
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
	databasePassword: z
		.string()
		.regex(/^[a-zA-Z0-9@#%^&*()_+\-=[\]{}|;:,.<>?~`]*$/, {
			message:
				"Password contains invalid characters. Please avoid: $ ! ' \" \\ / and space characters for database compatibility",
		}),
	databaseName: z.string().min(1),
	databaseUser: z.string().min(1),
	dockerImage: z.string().default("postgres:18"),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.string().optional(),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	environmentId: z.string(),
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
	stopGracePeriodSwarm: z.bigint().nullable(),
	endpointSpecSwarm: EndpointSpecSwarmSchema.nullable(),
	ulimitsSwarm: UlimitsSwarmSchema.nullable(),
});

export const apiCreatePostgres = createSchema.pick({
	name: true,
	appName: true,
	databaseName: true,
	databaseUser: true,
	databasePassword: true,
	dockerImage: true,
	environmentId: true,
	description: true,
	serverId: true,
});

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
