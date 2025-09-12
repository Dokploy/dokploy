import { environments } from "@dokploy/server/db/schema/environment";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const environmentsSelectSchema = createSelectSchema(environments);

export const apiCreateEnvironmentOutput = environmentsSelectSchema;

export const apiFindOneEnvironmentOutput = environmentsSelectSchema;

export const apiFindAllEnvironmentsOutput = z.array(environmentsSelectSchema);

export const apiUpdateEnvironmentOutput = environmentsSelectSchema;

export const apiDeleteEnvironmentOutput = environmentsSelectSchema;

export const apiDuplicateEnvironmentOutput = environmentsSelectSchema;