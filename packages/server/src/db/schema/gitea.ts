import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

// Gitea table definition
export const gitea = pgTable("gitea", {
  giteaId: text("giteaId")
    .notNull()
    .primaryKey()
    .$defaultFn(() => nanoid()), // Using nanoid for unique ID
  giteaUrl: text("giteaUrl").default("https://gitea.com").notNull(), // Default URL for Gitea
  redirectUri: text("redirect_uri"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  gitProviderId: text("gitProviderId")
    .notNull()
    .references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
  giteaUsername: text("gitea_username"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  scopes: text("scopes").default('repo,repo:status,read:user,read:org'),
  lastAuthenticatedAt: integer("last_authenticated_at"),
});

// Gitea relations with gitProvider
export const giteaProviderRelations = relations(gitea, ({ one }) => ({
  gitProvider: one(gitProvider, {
    fields: [gitea.gitProviderId],
    references: [gitProvider.gitProviderId],
  }),
}));

// Create schema for Gitea
const createSchema = createInsertSchema(gitea);

// API schema for creating a Gitea instance
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

// API schema for finding one Gitea instance
export const apiFindOneGitea = createSchema
  .extend({
    giteaId: z.string().min(1),
  })
  .pick({ giteaId: true });

// API schema for testing Gitea connection
export const apiGiteaTestConnection = createSchema
  .extend({
    organizationName: z.string().optional(),
  })
  .pick({ giteaId: true, organizationName: true });

export type ApiGiteaTestConnection = z.infer<typeof apiGiteaTestConnection>;

// API schema for finding branches in Gitea
export const apiFindGiteaBranches = z.object({
  id: z.number().optional(),
  owner: z.string().min(1),
  repositoryName: z.string().min(1),
  giteaId: z.string().optional(),
});

// API schema for updating Gitea instance
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