import { environments } from "@dokploy/server/db/schema/environment";
import { projects } from "@dokploy/server/db/schema/project";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const projectSelectSchema = createSelectSchema(projects);
const environmentSelectSchema = createSelectSchema(environments);

export const apiCreateProjectOutput = z.object({
	project: projectSelectSchema,
	environment: environmentSelectSchema,
});

export const apiFindOneProjectOutput = projectSelectSchema.extend({
	environments: z.array(environmentSelectSchema.extend({
		applications: z.array(z.unknown()).optional(),
		compose: z.array(z.unknown()).optional(),
		mariadb: z.array(z.unknown()).optional(),
		mongo: z.array(z.unknown()).optional(),
		mysql: z.array(z.unknown()).optional(),
		postgres: z.array(z.unknown()).optional(),
		redis: z.array(z.unknown()).optional(),
	})),
});

export const apiUpdateProjectOutput = projectSelectSchema;

export const apiDeleteProjectOutput = projectSelectSchema;

export const apiFindAllProjectsOutput = z.array(projectSelectSchema.extend({
	environments: z.array(environmentSelectSchema.extend({
		applications: z.array(z.unknown()).optional(),
		compose: z.array(z.unknown()).optional(),
		mariadb: z.array(z.unknown()).optional(),
		mongo: z.array(z.unknown()).optional(),
		mysql: z.array(z.unknown()).optional(),
		postgres: z.array(z.unknown()).optional(),
		redis: z.array(z.unknown()).optional(),
	})),
}));