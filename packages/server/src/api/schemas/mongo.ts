import { backups } from "@dokploy/server/db/schema/backups";
import { environments } from "@dokploy/server/db/schema/environment";
import { mongo } from "@dokploy/server/db/schema/mongo";
import { mounts } from "@dokploy/server/db/schema/mount";
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

const mongoSelectSchema = createSelectSchema(mongo).extend({
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

export const apiCreateMongo = mongoSelectSchema.omit({ mongoId: true });

export const apiCreateMongoOutput = mongoSelectSchema;

export const apiFindOneMongo = mongoSelectSchema.pick({ mongoId: true });

export const apiFindOneMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiUpdateMongo = mongoSelectSchema.partial();

export const apiDeleteMongo = mongoSelectSchema.pick({ mongoId: true });

export const apiStartMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiStopMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiSaveExternalPortMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiDeployMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiChangeMongoStatusOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiRemoveMongoOutput = mongoSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiMoveMongoOutput = mongoSelectSchema;
