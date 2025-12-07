import { backups } from "@dokploy/server/db/schema/backups";
import { environments } from "@dokploy/server/db/schema/environment";
import { mariadb } from "@dokploy/server/db/schema/mariadb";
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

const mariadbSelectSchema = createSelectSchema(mariadb).extend({
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

export const apiCreateMariaDB = mariadbSelectSchema.omit({ mariadbId: true });

export const apiCreateMariaDBOutput = mariadbSelectSchema;

export const apiFindOneMariaDB = mariadbSelectSchema.pick({ mariadbId: true });

export const apiFindOneMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiUpdateMariaDB = mariadbSelectSchema.partial();

export const apiDeleteMariaDB = mariadbSelectSchema.pick({ mariadbId: true });

export const apiStartMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiStopMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiSaveExternalPortMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiDeployMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiChangeMariaDBStatusOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiRemoveMariaDBOutput = mariadbSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
  backups: z.array(backupSelectSchema),
});

export const apiMoveMariaDBOutput = mariadbSelectSchema;
