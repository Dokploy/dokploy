import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pgTable, text } from "drizzle-orm/pg-core";

export const source = pgTable("project", {
	projectId: text("projectId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

const createSchema = createInsertSchema(source, {
	name: z.string().min(1),
	description: z.string(),
	projectId: z.string(),
});

export const apiCreate = createSchema.pick({
	name: true,
	description: true,
});
