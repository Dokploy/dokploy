import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { admins } from "./admin";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";

export const ai = pgTable("ai", {
  aiId: text("aiId")
    .notNull()
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  apiUrl: text("apiUrl").notNull(),
  apiKey: text("apiKey").notNull(),
  model: text("model").notNull(),
  isEnabled: boolean("isEnabled").notNull().default(true),
  adminId: text("adminId")
    .notNull()
    .references(() => admins.adminId, { onDelete: "cascade" }), // Admin ID who created the AI settings
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const aiRelations = relations(ai, ({ one }) => ({
  admin: one(admins, {
    fields: [ai.adminId],
    references: [admins.adminId],
  }),
}));

const createSchema = createInsertSchema(ai, {
  name: z.string().min(1, { message: "Name is required" }),
  apiUrl: z.string().url({ message: "Please enter a valid URL" }),
  apiKey: z.string().min(1, { message: "API Key is required" }),
  model: z.string().min(1, { message: "Model is required" }),
  isEnabled: z.boolean().optional(),
});

export const apiCreateAi = createSchema
  .pick({
    name: true,
    apiUrl: true,
    apiKey: true,
    model: true,
    isEnabled: true,
  })
  .required();

export const apiUpdateAi = createSchema
  .partial()
  .extend({
    aiId: z.string().min(1),
  })
  .omit({ adminId: true });

export const deploySuggestionSchema = z.object({
  projectId: z.string().min(1),
  id: z.string().min(1),
  dockerCompose: z.string().min(1),
  envVariables: z.string(),
  serverId: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
});
