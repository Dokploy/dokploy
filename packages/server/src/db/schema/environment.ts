import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
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
	isDefault: boolean("isDefault").notNull().default(false),
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

export const apiCreateEnvironment = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	projectId: z.string().min(1),
});

export const apiFindOneEnvironment = z.object({
	environmentId: z.string().min(1),
});

export const apiRemoveEnvironment = z.object({
	environmentId: z.string().min(1),
});

export const apiUpdateEnvironment = z.object({
	environmentId: z.string().min(1),
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	projectId: z.string().optional(),
	env: z.string().optional(),
});

export const apiDuplicateEnvironment = z.object({
	environmentId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});
