import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

export const azureDevops = pgTable("azure_devops", {
	azureDevopsId: text("azureDevopsId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationName: text("organizationName").notNull(),
	personalAccessToken: text("personalAccessToken").notNull(),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
});

export const azureDevopsRelations = relations(azureDevops, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [azureDevops.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

const createSchema = createInsertSchema(azureDevops);

export const apiCreateAzureDevops = createSchema.extend({
	authId: z.string().min(1),
	name: z.string().min(1),
	organizationName: z.string().min(1),
	personalAccessToken: z.string().min(1),
	gitProviderId: z.string().optional(),
});

export const apiFindOneAzureDevops = z.object({
	azureDevopsId: z.string().min(1),
});

export const apiFindAzureDevopsBranches = z.object({
	azureDevopsId: z.string().min(1),
	projectId: z.string().min(1),
	repositoryId: z.string().min(1),
});

export const apiUpdateAzureDevops = z.object({
	azureDevopsId: z.string().min(1),
	name: z.string().min(1),
	organizationName: z.string().min(1),
	personalAccessToken: z.string().min(1),
	organizationId: z.string().optional(),
});

export const apiAzureDevopsTestConnection = apiFindOneAzureDevops;
