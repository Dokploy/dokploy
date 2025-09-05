import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";
import { mariadb } from "./mariadb";
import { mongo } from "./mongo";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { projects } from "./project";
import { redis } from "./redis";

export const environments = pgTable("environment", {
	environmentId: text("environmentId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	env: text("env").notNull().default(""),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
});

export const environmentRelations = relations(
	environments,
	({ one, many }) => ({
		project: one(projects, {
			fields: [environments.projectId],
			references: [projects.projectId],
		}),
		applications: many(applications),
		mariadb: many(mariadb),
		postgres: many(postgres),
		mysql: many(mysql),
		redis: many(redis),
		mongo: many(mongo),
		compose: many(compose),
	}),
);

const createSchema = createInsertSchema(environments, {
	environmentId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});

export const apiCreateEnvironment = createSchema.pick({
	name: true,
	description: true,
	projectId: true,
});

export const apiFindOneEnvironment = createSchema
	.pick({
		environmentId: true,
	})
	.required();

export const apiRemoveEnvironment = createSchema
	.pick({
		environmentId: true,
	})
	.required();

export const apiUpdateEnvironment = createSchema.partial().extend({
	environmentId: z.string().min(1),
});

export const apiDuplicateEnvironment = createSchema
	.pick({
		environmentId: true,
		name: true,
		description: true,
	})
	.required({
		environmentId: true,
		name: true,
	});
