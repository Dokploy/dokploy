import { backups } from "@dokploy/server/db/schema/backups";
import { environments } from "@dokploy/server/db/schema/environment";
import { mounts } from "@dokploy/server/db/schema/mount";
import { postgres } from "@dokploy/server/db/schema/postgres";
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

const postgresSelectSchema = createSelectSchema(postgres).extend({
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

export const apiCreatePostgres = postgresSelectSchema.omit({
  postgresId: true,
});

export const apiCreatePostgresOutput = postgresSelectSchema.omit({
  postgresId: true,
});

export const apiFindOnePostgres = postgresSelectSchema.pick({
  postgresId: true,
});

export const apiFindOnePostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiUpdatePostgres = postgresSelectSchema.partial();

export const apiDeletePostgres = postgresSelectSchema.pick({
  postgresId: true,
});

export const apiStartPostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiStopPostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiSaveExternalPortPostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiDeployPostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiChangePostgresStatusOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiRemovePostgresOutput = postgresSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiMovePostgresOutput = postgresSelectSchema;
