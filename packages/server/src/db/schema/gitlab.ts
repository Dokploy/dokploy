import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

export const gitlab = pgTable("gitlab", {
	gitlabId: text("gitlabId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	gitlabUrl: text("gitlabUrl").default("https://gitlab.com").notNull(),
	applicationId: text("application_id"),
	redirectUri: text("redirect_uri"),
	secret: text("secret"),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	groupName: text("group_name"),
	expiresAt: integer("expires_at"),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
});

export const gitlabProviderRelations = relations(gitlab, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [gitlab.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

const createSchema = createInsertSchema(gitlab);

export const apiCreateGitlab = createSchema.extend({
	applicationId: z.string().optional(),
	secret: z.string().optional(),
	groupName: z.string().optional(),
	gitProviderId: z.string().optional(),
	redirectUri: z.string().optional(),
	authId: z.string().min(1),
	name: z.string().min(1),
	gitlabUrl: z.string().min(1),
});

export const apiFindOneGitlab = createSchema
	.extend({
		gitlabId: z.string().min(1),
	})
	.pick({ gitlabId: true });

export const apiGitlabTestConnection = createSchema
	.extend({
		groupName: z.string().optional(),
	})
	.pick({ gitlabId: true, groupName: true });

export const apiFindGitlabBranches = z.object({
	id: z.number().optional(),
	owner: z.string(),
	repo: z.string(),
	gitlabId: z.string().optional(),
});

export const apiUpdateGitlab = createSchema.extend({
	applicationId: z.string().optional(),
	secret: z.string().optional(),
	groupName: z.string().optional(),
	redirectUri: z.string().optional(),
	name: z.string().min(1),
	gitlabId: z.string().min(1),
	gitlabUrl: z.string().min(1),
});
