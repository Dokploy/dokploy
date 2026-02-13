import { relations } from "drizzle-orm";
import { pgTable, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";
import { projects } from "./project";

export const tags = pgTable(
	"tag",
	{
		tagId: text("tagId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text("name").notNull(),
		color: text("color"),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),

		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
	},
	(table) => ({
		// Unique index on (organizationId, name) to prevent duplicate tag names per organization
		uniqueOrgName: unique("unique_org_tag_name").on(
			table.organizationId,
			table.name,
		),
	}),
);

export const projectTags = pgTable(
	"project_tag",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		projectId: text("projectId")
			.notNull()
			.references(() => projects.projectId, { onDelete: "cascade" }),
		tagId: text("tagId")
			.notNull()
			.references(() => tags.tagId, { onDelete: "cascade" }),
	},
	(table) => ({
		// Unique constraint to prevent duplicate project-tag associations
		uniqueProjectTag: unique("unique_project_tag").on(
			table.projectId,
			table.tagId,
		),
	}),
);

export const tagRelations = relations(tags, ({ one, many }) => ({
	organization: one(organization, {
		fields: [tags.organizationId],
		references: [organization.id],
	}),
	projectTags: many(projectTags),
}));

export const projectTagRelations = relations(projectTags, ({ one }) => ({
	project: one(projects, {
		fields: [projectTags.projectId],
		references: [projects.projectId],
	}),
	tag: one(tags, {
		fields: [projectTags.tagId],
		references: [tags.tagId],
	}),
}));

const createSchema = createInsertSchema(tags, {
	tagId: z.string().min(1),
	name: z.string().min(1),
	color: z.string().optional(),
});

export const apiCreateTag = createSchema.pick({
	name: true,
	color: true,
});

export const apiFindOneTag = createSchema
	.pick({
		tagId: true,
	})
	.required();

export const apiRemoveTag = createSchema
	.pick({
		tagId: true,
	})
	.required();

export const apiUpdateTag = createSchema.partial().extend({
	tagId: z.string().min(1),
});
