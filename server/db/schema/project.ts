import { relations } from "drizzle-orm";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pgTable, text } from "drizzle-orm/pg-core";
import { mysql } from "./mysql";
import { postgres } from "./postgres";
import { mariadb } from "./mariadb";
import { applications } from "./application";
import { mongo } from "./mongo";
import { redis } from "./redis";
import { admins } from "./admin";
import { compose } from "./compose";

export const projects = pgTable("project", {
	projectId: text("projectId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
});

export const projectRelations = relations(projects, ({ many, one }) => ({
	mysql: many(mysql),
	postgres: many(postgres),
	mariadb: many(mariadb),
	applications: many(applications),
	mongo: many(mongo),
	redis: many(redis),
	compose: many(compose),
	admin: one(admins, {
		fields: [projects.adminId],
		references: [admins.adminId],
	}),
}));

const createSchema = createInsertSchema(projects, {
	projectId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
});

export const apiCreateProject = createSchema.pick({
	name: true,
	description: true,
});

export const apiFindOneProject = createSchema
	.pick({
		projectId: true,
	})
	.required();

export const apiRemoveProject = createSchema
	.pick({
		projectId: true,
	})
	.required();

export const apiUpdateProject = createSchema
	.pick({
		name: true,
		description: true,
		projectId: true,
	})
	.required();
