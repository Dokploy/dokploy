import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pgTable, text } from "drizzle-orm/pg-core";
import { projects } from "./project";
import { relations } from "drizzle-orm";
import { deployments } from "./deployment";
import { generateAppName } from "./utils";

export const compose = pgTable("compose", {
	composeId: text("composeId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	appName: text("appName")
		.notNull()
		.$defaultFn(() => generateAppName("compose")),
	description: text("description"),
	env: text("env"),
	composeFile: text("composeFile"),
	command: text("command").default(""),
	projectId: text("projectId")
		.notNull()
		.references(() => projects.projectId, { onDelete: "cascade" }),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const composeRelations = relations(compose, ({ one, many }) => ({
	project: one(projects, {
		fields: [compose.projectId],
		references: [projects.projectId],
	}),
	deployments: many(deployments),
}));

const createSchema = createInsertSchema(compose, {
	name: z.string().min(1),
	description: z.string(),
	env: z.string().optional(),
	composeFile: z.string(),
	projectId: z.string(),
	command: z.string().optional(),
});

export const apiCreateCompose = createSchema.pick({
	name: true,
	description: true,
	projectId: true,
});

export const apiFindCompose = z.object({
	composeId: z.string().min(1),
});

export const apiUpdateCompose = createSchema.partial().extend({
	composeId: z.string(),
	composeFile: z.string().optional(),
	command: z.string().optional(),
});
