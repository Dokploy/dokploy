import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { applications } from "./application";
import { compose } from "./compose";

export const patchType = pgEnum("patchType", ["create", "update", "delete"]);

export const patch = pgTable(
	"patch",
	{
		patchId: text("patchId")
			.notNull()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		type: patchType("type").notNull().default("update"),
		filePath: text("filePath").notNull(),
		enabled: boolean("enabled").notNull().default(true),
		content: text("content").notNull(),
		createdAt: text("createdAt")
			.notNull()
			.$defaultFn(() => new Date().toISOString()),
		updatedAt: text("updatedAt").$defaultFn(() => new Date().toISOString()),
		// Relations - one of these must be set
		applicationId: text("applicationId").references(
			() => applications.applicationId,
			{ onDelete: "cascade" },
		),
		composeId: text("composeId").references(() => compose.composeId, {
			onDelete: "cascade",
		}),
	},
	(table) => [
		// Unique constraint: one patch per file per application/compose
		unique("patch_filepath_application_unique").on(
			table.filePath,
			table.applicationId,
		),
		unique("patch_filepath_compose_unique").on(table.filePath, table.composeId),
	],
);

export const patchRelations = relations(patch, ({ one }) => ({
	application: one(applications, {
		fields: [patch.applicationId],
		references: [applications.applicationId],
	}),
	compose: one(compose, {
		fields: [patch.composeId],
		references: [compose.composeId],
	}),
}));

const createSchema = createInsertSchema(patch, {
	filePath: z.string().min(1),
	content: z.string(),
	type: z.enum(["create", "update", "delete"]).optional(),
	enabled: z.boolean().optional(),
	applicationId: z.string().optional(),
	composeId: z.string().optional(),
});

export const apiCreatePatch = createSchema.pick({
	filePath: true,
	content: true,
	type: true,
	enabled: true,
	applicationId: true,
	composeId: true,
});

export const apiFindPatch = z.object({
	patchId: z.string().min(1),
});

export const apiFindPatchesByApplicationId = z.object({
	applicationId: z.string().min(1),
});

export const apiFindPatchesByComposeId = z.object({
	composeId: z.string().min(1),
});

export const apiUpdatePatch = createSchema
	.partial()
	.extend({
		patchId: z.string().min(1),
	})
	.omit({ applicationId: true, composeId: true });

export const apiDeletePatch = z.object({
	patchId: z.string().min(1),
});

export const apiTogglePatchEnabled = z.object({
	patchId: z.string().min(1),
	enabled: z.boolean(),
});
