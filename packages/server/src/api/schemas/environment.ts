import { applications } from "@dokploy/server/db/schema/application";
import { compose } from "@dokploy/server/db/schema/compose";
import { environments } from "@dokploy/server/db/schema/environment";
import { mariadb } from "@dokploy/server/db/schema/mariadb";
import { mongo } from "@dokploy/server/db/schema/mongo";
import { mysql } from "@dokploy/server/db/schema/mysql";
import { postgres } from "@dokploy/server/db/schema/postgres";
import { projects } from "@dokploy/server/db/schema/project";
import { redis } from "@dokploy/server/db/schema/redis";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const environmentsSelectSchema = createSelectSchema(environments);
const applicationsSelectSchema = createSelectSchema(applications);
const composeSelectSchema = createSelectSchema(compose);
const mariadbSelectSchema = createSelectSchema(mariadb);
const mongoSelectSchema = createSelectSchema(mongo);
const mysqlSelectSchema = createSelectSchema(mysql);
const postgresSelectSchema = createSelectSchema(postgres);
const redisSelectSchema = createSelectSchema(redis);
const projectSelectSchema = createSelectSchema(projects);

// Full environment object as returned by environment.one and environment.byProjectId
const environmentWithRelationsSchema = environmentsSelectSchema.extend({
	project: projectSelectSchema,
	applications: z.array(applicationsSelectSchema),
	mariadb: z.array(mariadbSelectSchema),
	mongo: z.array(mongoSelectSchema),
	mysql: z.array(mysqlSelectSchema),
	postgres: z.array(postgresSelectSchema),
	redis: z.array(redisSelectSchema),
	compose: z.array(composeSelectSchema),
});

export const apiCreateEnvironmentOutput = environmentsSelectSchema;

export const apiFindOneEnvironmentOutput = environmentWithRelationsSchema;

export const apiFindAllEnvironmentsOutput = z.array(
	environmentWithRelationsSchema,
);

export const apiUpdateEnvironmentOutput = environmentsSelectSchema;

export const apiDeleteEnvironmentOutput = environmentsSelectSchema;

export const apiDuplicateEnvironmentOutput = environmentsSelectSchema;
