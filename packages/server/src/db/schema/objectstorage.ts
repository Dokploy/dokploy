import { relations } from "drizzle-orm";
import {
	bigint,
	boolean,
	integer,
	json,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
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
import {
	APP_NAME_MESSAGE,
	APP_NAME_REGEX,
	encryptedText,
	generateAppName,
} from "./utils";

export const objectStorageProvider = pgEnum("objectStorageProvider", [
	"minio",
	"garage",
	"alarik",
	"rustfs",
]);

export type ObjectStorageProvider =
	(typeof objectStorageProvider.enumValues)[number];

export const objectstorage = pgTable("objectstorage", {
	objectStorageId: text("objectStorageId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("objectstorage"))
		.unique(),
	description: text("description"),
	provider: objectStorageProvider("provider").notNull().default("minio"),
	dockerImage: text("dockerImage").notNull(),
	command: text("command"),
	args: text("args").array(),
	env: encryptedText("env"),
	rootUser: text("rootUser").notNull(),
	rootPassword: text("rootPassword").notNull(),
	bucket: text("bucket"),
	region: text("region").default("us-east-1"),
	externalPort: integer("externalPort"),
	consolePort: integer("consolePort"),
	memoryReservation: text("memoryReservation"),
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
	stopGracePeriodSwarm: bigint("stopGracePeriodSwarm", { mode: "number" }),
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
	networkIds: text("networkIds").array().default([]),
	detachDokployNetwork: boolean("detachDokployNetwork")
		.notNull()
		.default(false),
});

export const objectstorageRelations = relations(
	objectstorage,
	({ one, many }) => ({
		environment: one(environments, {
			fields: [objectstorage.environmentId],
			references: [environments.environmentId],
		}),
		mounts: many(mounts),
		server: one(server, {
			fields: [objectstorage.serverId],
			references: [server.serverId],
		}),
	}),
);

const createSchema = createInsertSchema(objectstorage, {
	objectStorageId: z.string(),
	name: z.string().min(1),
	appName: z
		.string()
		.min(1)
		.max(63)
		.regex(APP_NAME_REGEX, APP_NAME_MESSAGE)
		.optional(),
	rootUser: z.string().min(1),
	rootPassword: z.string().min(1),
	bucket: z.string().optional(),
	region: z.string().optional(),
	dockerImage: z.string(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.string().optional(),
	memoryReservation: z.string().optional(),
	memoryLimit: z.string().optional(),
	cpuReservation: z.string().optional(),
	cpuLimit: z.string().optional(),
	environmentId: z.string(),
	applicationStatus: z.enum(["idle", "running", "done", "error"]),
	externalPort: z.number().nullable().optional(),
	consolePort: z.number().nullable().optional(),
	createdAt: z.string(),
	description: z.string().optional(),
	serverId: z.string().optional(),
	provider: z.enum(["minio", "garage", "alarik", "rustfs"]),
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
	stopGracePeriodSwarm: z.number().nullable(),
	endpointSpecSwarm: EndpointSpecSwarmSchema.nullable(),
	ulimitsSwarm: UlimitsSwarmSchema.nullable(),
	networkIds: z.array(z.string()).optional(),
	detachDokployNetwork: z.boolean().optional(),
});

export const apiCreateObjectStorage = createSchema.pick({
	name: true,
	appName: true,
	dockerImage: true,
	environmentId: true,
	description: true,
	serverId: true,
	provider: true,
	rootUser: true,
	rootPassword: true,
	bucket: true,
	region: true,
});

export const apiFindObjectStorage = z.object({
	objectStorageId: z.string().min(1),
});

export const apiChangeObjectStorageStatus = createSchema
	.pick({
		objectStorageId: true,
		applicationStatus: true,
	})
	.required();

export const apiSaveEnvironmentVariablesObjectStorage = createSchema
	.pick({
		objectStorageId: true,
		env: true,
	})
	.required();

export const apiSaveExternalPortObjectStorage = createSchema
	.pick({
		objectStorageId: true,
		externalPort: true,
		consolePort: true,
	})
	.required();

export const apiDeployObjectStorage = createSchema
	.pick({
		objectStorageId: true,
	})
	.required();

export const apiResetObjectStorage = createSchema
	.pick({
		objectStorageId: true,
		appName: true,
	})
	.required();

export const apiUpdateObjectStorage = createSchema
	.partial()
	.extend({
		objectStorageId: z.string().min(1),
		dockerImage: z.string().optional(),
	})
	.omit({ serverId: true });

export const apiRebuildObjectStorage = createSchema
	.pick({
		objectStorageId: true,
	})
	.required();
