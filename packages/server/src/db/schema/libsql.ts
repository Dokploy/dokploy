import { relations } from "drizzle-orm";
import { boolean, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { backups } from "./backups";
import { destinations } from "./destination";
import { environments } from "./environment";
import { mounts } from "./mount";
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
	sqldNode,
	type UpdateConfigSwarm,
	UpdateConfigSwarmSchema,
} from "./shared";
import { generateAppName } from "./utils";

export const libsql = pgTable("libsql", {
	libsqlId: text("libsqlId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("libsql"))
		.unique(),
	description: text("description"),
	databaseUser: text("databaseUser").notNull(),
	databasePassword: text("databasePassword").notNull(),
	sqldNode: sqldNode("sqldNode").notNull().default("primary"),
	sqldPrimaryUrl: text("sqldPrimaryUrl"),
	enableNamespaces: boolean("enableNamespaces").notNull().default(false),
	enableBottomlessReplication: boolean("enableBottomlessReplication")
		.notNull()
		.default(false),
	bottomlessReplicationDestinationId: text(
		"bottomlessReplicationDestinationId",
	).references(() => destinations.destinationId, {
		onDelete: "set null",
	}),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	env: text("env"),
	// RESOURCES
	memoryReservation: text("memoryReservation"),
	memoryLimit: text("memoryLimit"),
	cpuReservation: text("cpuReservation"),
	cpuLimit: text("cpuLimit"),
	//
	externalPort: integer("externalPort"),
	externalGRPCPort: integer("externalGRPCPort"),
	externalAdminPort: integer("externalAdminPort"),
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

	environmentId: text("environmentId")
		.notNull()
		.references(() => environments.environmentId, { onDelete: "cascade" }),
	serverId: text("serverId").references(() => server.serverId, {
		onDelete: "cascade",
	}),
});

export const libsqlRelations = relations(libsql, ({ one, many }) => ({
	environment: one(environments, {
		fields: [libsql.environmentId],
		references: [environments.environmentId],
	}),
	//backups: many(backups),
	mounts: many(mounts),
	server: one(server, {
		fields: [libsql.serverId],
		references: [server.serverId],
	}),
	bottomlessReplicationDestination: one(destinations, {
		fields: [libsql.bottomlessReplicationDestinationId],
		references: [destinations.destinationId],
	}),
}));

const createSchema = createInsertSchema(libsql, {
	libsqlId: z.string(),
	name: z.string().min(1),
	appName: z.string().min(1),
	createdAt: z.string(),
	databaseUser: z.string().min(1),
	databasePassword: z
		.string()
		.regex(/^[a-zA-Z0-9@#%^&*()_+\-=[\]{}|;:,.<>?~`]*$/, {
			message:
				"Password contains invalid characters. Please avoid: $ ! ' \" \\ / and space characters for database compatibility",
		}),
	sqldNode: z.enum(sqldNode.enumValues),
	sqldPrimaryUrl: z.string().nullable(),
	enableNamespaces: z.boolean().default(false),
	enableBottomlessReplication: z.boolean().default(false),
	bottomlessReplicationDestinationId: z.string().nullable(),
	dockerImage: z.string().default("ghcr.io/tursodatabase/libsql-server:latest"),
	command: z.string().optional(),
	env: z.string().optional(),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	environmentId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number(),
	externalGRPCPort: z.number(),
	externalAdminPort: z.number(),
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

export const apiCreateLibsql = createSchema
	.pick({
		name: true,
		appName: true,
		dockerImage: true,
		environmentId: true,
		description: true,
		databaseUser: true,
		databasePassword: true,
		sqldNode: true,
		sqldPrimaryUrl: true,
		enableNamespaces: true,
		serverId: true,
	})
	.required()
	.superRefine((data, ctx) => {
		if (data.sqldNode === "replica" && !data.sqldPrimaryUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["sqldPrimaryUrl"],
				message: "sqldPrimaryUrl is required when sqldNode is 'replica'.",
			});
		}
		if (data.sqldNode !== "replica" && data.sqldPrimaryUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["sqldPrimaryUrl"],
				message:
					"sqldPrimaryUrl should not be provided when sqldNode is not 'replica'.",
			});
		}
	});

export const apiFindOneLibsql = createSchema
	.pick({
		libsqlId: true,
	})
	.required();

export const apiChangeLibsqlStatus = createSchema
	.pick({
		libsqlId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesLibsql = createSchema
	.pick({
		libsqlId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortsLibsql = createSchema
	.pick({
		libsqlId: true,
		externalPort: true,
		externalGRPCPort: true,
		externalAdminPort: true,
	})
	.required({ libsqlId: true })
	.superRefine((data, ctx) => {
		if (
			data.externalPort === null &&
			data.externalGRPCPort === null &&
			data.externalAdminPort === null
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Either externalPort, externalGRPCPort or externalAdminPort must be provided.",
				path: ["externalPort", "externalGRPCPort", "externalAdminPort"],
			});
		}
	});

export const apiDeployLibsql = createSchema
	.pick({
		libsqlId: true,
	})
	.required();

export const apiResetLibsql = createSchema
	.pick({
		libsqlId: true,
		appName: true,
	})
	.required();

export const apiUpdateLibsql = createSchema
	.partial()
	.extend({
		libsqlId: z.string().min(1),
	})
	.omit({ serverId: true });

export const apiRebuildLibsql = createSchema
	.pick({
		libsqlId: true,
	})
	.required();
