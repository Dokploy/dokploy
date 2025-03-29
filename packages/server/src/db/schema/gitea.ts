import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

export const gitea = pgTable("gitea", {
	giteaId: text("giteaId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	giteaUrl: text("giteaUrl").default("https://gitea.com").notNull(),
	redirectUri: text("redirect_uri"),
	clientId: text("client_id"),
	clientSecret: text("client_secret"),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	expiresAt: integer("expires_at"),
	scopes: text("scopes").default("repo,repo:status,read:user,read:org"),
	lastAuthenticatedAt: integer("last_authenticated_at"),
});

export const giteaProviderRelations = relations(gitea, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [gitea.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

const createSchema = createInsertSchema(gitea);

export const apiCreateGitea = createSchema.extend({
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	gitProviderId: z.string().optional(),
	redirectUri: z.string().optional(),
	name: z.string().min(1),
	giteaUrl: z.string().min(1),
	giteaUsername: z.string().optional(),
	accessToken: z.string().optional(),
	refreshToken: z.string().optional(),
	expiresAt: z.number().optional(),
	organizationName: z.string().optional(),
	scopes: z.string().optional(),
	lastAuthenticatedAt: z.number().optional(),
});

export const apiFindOneGitea = createSchema
	.extend({
		giteaId: z.string().min(1),
	})
	.pick({ giteaId: true });

export const apiGiteaTestConnection = createSchema
	.extend({
		organizationName: z.string().optional(),
	})
	.pick({ giteaId: true, organizationName: true });

export type ApiGiteaTestConnection = z.infer<typeof apiGiteaTestConnection>;

export const apiFindGiteaBranches = z.object({
	owner: z.string().min(1),
	repositoryName: z.string().min(1),
	giteaId: z.string().optional(),
});

export const apiUpdateGitea = createSchema.extend({
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	redirectUri: z.string().optional(),
	name: z.string().min(1),
	giteaId: z.string().min(1),
	giteaUrl: z.string().min(1),
	giteaUsername: z.string().optional(),
	accessToken: z.string().optional(),
	refreshToken: z.string().optional(),
	expiresAt: z.number().optional(),
	organizationName: z.string().optional(),
	scopes: z.string().optional(),
	lastAuthenticatedAt: z.number().optional(),
});
