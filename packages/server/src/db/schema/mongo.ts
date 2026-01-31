import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	integer,
	json,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
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
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import { APP_NAME_MESSAGE, APP_NAME_REGEX, generateAppName } from "./utils";

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
	args: text("args").array(),
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
	stopGracePeriodSwarm: bigint("stopGracePeriodSwarm", { mode: "bigint" }),
	endpointSpecSwarm: json("endpointSpecSwarm").$type<EndpointSpecSwarm>(),
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
	replicaSets: boolean("replicaSets").default(false),
});

export const mongoRelations = relations(mongo, ({ one, many }) => ({
	environment: one(environments, {
		fields: [mongo.environmentId],
		references: [environments.environmentId],
	}),
	backups: many(backups),
	mounts: many(mounts),
	server: one(server, {
		fields: [mongo.serverId],
		references: [server.serverId],
	}),
}));

const createSchema = createInsertSchema(mongo, {
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
	createdAt: z.string(),
	mongoId: z.string(),
	name: z.string().min(1),
	databasePassword: z
		.string()
		.regex(/^[a-zA-Z0-9@#%^&*()_+\-=[\]{}|;:,.<>?~`]*$/, {
			message:
				"Password contains invalid characters. Please avoid: $ ! ' \" \\ / and space characters for database compatibility",
		}),
	databaseUser: z.string().min(1),
	dockerImage: z.string().default("mongo:15"),
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
	description: z.string().optional(),
	serverId: z.string().optional(),
	replicaSets: z.boolean().default(false),
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
});

export const apiCreateMongo = createSchema.pick({
	name: true,
	appName: true,
	dockerImage: true,
	environmentId: true,
	description: true,
	databaseUser: true,
	databasePassword: true,
	serverId: true,
	replicaSets: true,
});

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

export const apiUpdateMongo = createSchema
	.partial()
	.extend({
		mongoId: z.string().min(1),
	})
	.omit({ serverId: true });

export const apiResetMongo = createSchema
	.pick({
		mongoId: true,
		appName: true,
	})
	.required();

export const apiRebuildMongo = createSchema
	.pick({
		mongoId: true,
	})
	.required();
