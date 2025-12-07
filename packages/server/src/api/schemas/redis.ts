import { environments } from "@dokploy/server/db/schema/environment";
import { mounts } from "@dokploy/server/db/schema/mount";
import { projects } from "@dokploy/server/db/schema/project";
import { redis } from "@dokploy/server/db/schema/redis";
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

const redisSelectSchema = createSelectSchema(redis).extend({
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

export const apiCreateRedis = redisSelectSchema.omit({ redisId: true });

export const apiCreateRedisOutput = redisSelectSchema;

export const apiFindOneRedis = redisSelectSchema.pick({ redisId: true });

export const apiFindOneRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiUpdateRedis = redisSelectSchema.partial();

export const apiDeleteRedis = redisSelectSchema.pick({ redisId: true });

export const apiStartRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiStopRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiSaveExternalPortRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiDeployRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiChangeRedisStatusOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiRemoveRedisOutput = redisSelectSchema.extend({
  environment: environmentSelectSchema,
  mounts: z.array(mountSelectSchema),
  server: serverSelectSchema.nullable(),
});

export const apiMoveRedisOutput = redisSelectSchema;
