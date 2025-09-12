import { backups } from "@dokploy/server/db/schema/backups";
import { environments } from "@dokploy/server/db/schema/environment";
import { mounts } from "@dokploy/server/db/schema/mount";
import { mysql } from "@dokploy/server/db/schema/mysql";
import { projects } from "@dokploy/server/db/schema/project";
import { server } from "@dokploy/server/db/schema/server";
import {
	HealthCheckSwarmSchema,
	LabelsSwarmSchema,
	NetworkSwarmSchema,
	PlacementSwarmSchema,
	RestartPolicySwarmSchema,
	ServiceModeSwarmSchema,
	UpdateConfigSwarmSchema,
} from "@dokploy/server/db/schema/shared";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const mysqlSelectSchema = createSelectSchema(mysql).extend({
	healthCheckSwarm: HealthCheckSwarmSchema.nullable(),
	restartPolicySwarm: RestartPolicySwarmSchema.nullable(),
	placementSwarm: PlacementSwarmSchema.nullable(),
	updateConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	rollbackConfigSwarm: UpdateConfigSwarmSchema.nullable(),
	modeSwarm: ServiceModeSwarmSchema.nullable(),
	labelsSwarm: LabelsSwarmSchema.nullable(),
	networkSwarm: NetworkSwarmSchema.nullable(),
});
const environmentSelectSchema = createSelectSchema(environments).extend({
	project: createSelectSchema(projects),
});
const mountSelectSchema = createSelectSchema(mounts);
const serverSelectSchema = createSelectSchema(server);
const backupSelectSchema = createSelectSchema(backups).extend({
	metadata: z
		.union([
			z.object({
				postgres: z
					.object({
						databaseUser: z.string(),
					})
					.optional(),
				mariadb: z
					.object({
						databaseUser: z.string(),
						databasePassword: z.string(),
					})
					.optional(),
				mongo: z
					.object({
						databaseUser: z.string(),
						databasePassword: z.string(),
					})
					.optional(),
				mysql: z
					.object({
						databaseRootPassword: z.string(),
					})
					.optional(),
			}),
			z.null(),
		])
		.optional(),
});

export const apiCreateMySql = mysqlSelectSchema.omit({ mysqlId: true });

export const apiCreateMySqlOutput = mysqlSelectSchema.omit({ mysqlId: true });

export const apiFindOneMySql = mysqlSelectSchema.pick({ mysqlId: true });

export const apiFindOneMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiUpdateMySql = mysqlSelectSchema.partial();

export const apiDeleteMySql = mysqlSelectSchema.pick({ mysqlId: true });

export const apiStartMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiStopMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiSaveExternalPortMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiDeployMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiChangeMySqlStatusOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiRemoveMySqlOutput = mysqlSelectSchema.extend({
	environment: environmentSelectSchema,
	mounts: z.array(mountSelectSchema),
	server: serverSelectSchema.nullable(),
	backups: z.array(backupSelectSchema),
});

export const apiMoveMySqlOutput = mysqlSelectSchema;
