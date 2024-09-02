import { relations } from "drizzle-orm";
import { pgTable, text, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "./auth";

export const gitProviderType = pgEnum("gitProviderType", [
	"github",
	"gitlab",
	"bitbucket",
]);

export const gitProvider = pgTable("git_provider", {
	gitProviderId: text("gitProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	providerType: gitProviderType("providerType").notNull().default("github"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	authId: text("authId")
		.notNull()
		.references(() => auth.id, { onDelete: "cascade" }),
});

export const gitProviderRelations = relations(gitProvider, ({ one, many }) => ({
	github: one(github, {
		fields: [gitProvider.gitProviderId],
		references: [github.gitProviderId],
	}),
	gitlab: one(gitlab, {
		fields: [gitProvider.gitProviderId],
		references: [gitlab.gitProviderId],
	}),
	bitbucket: one(bitbucket, {
		fields: [gitProvider.gitProviderId],
		references: [bitbucket.gitProviderId],
	}),
	auth: one(auth, {
		fields: [gitProvider.authId],
		references: [auth.id],
	}),
}));

export const github = pgTable("github", {
	githubId: text("githubId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	githubAppName: text("githubAppName"),
	githubAppId: integer("githubAppId"),
	githubClientId: text("githubClientId"),
	githubClientSecret: text("githubClientSecret"),
	githubInstallationId: text("githubInstallationId"),
	githubPrivateKey: text("githubPrivateKey"),
	githubWebhookSecret: text("githubWebhookSecret"),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
});

export const githubProviderRelations = relations(github, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [github.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

export const gitlab = pgTable("gitlab", {
	gitlabId: text("gitlabId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
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

export const bitbucket = pgTable("bitbucket", {
	bitbucketId: text("bitbucketId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	bitbucketUsername: text("bitbucketUsername"),
	appPassword: text("appPassword"),
	bitbucketWorkspaceName: text("bitbucketWorkspaceName"),
	gitProviderId: text("gitProviderId")
		.notNull()
		.references(() => gitProvider.gitProviderId, { onDelete: "cascade" }),
});

export const bitbucketProviderRelations = relations(bitbucket, ({ one }) => ({
	gitProvider: one(gitProvider, {
		fields: [bitbucket.gitProviderId],
		references: [gitProvider.gitProviderId],
	}),
}));

const createSchema = createInsertSchema(gitProvider);

export const apiCreateGithub = createSchema.extend({
	githubAppName: z.string().optional(),
	githubAppId: z.number().optional(),
	githubClientId: z.string().optional(),
	githubClientSecret: z.string().optional(),
	githubInstallationId: z.string().optional(),
	githubPrivateKey: z.string().optional(),
	githubWebhookSecret: z.string().nullable(),
	gitProviderId: z.string().optional(),
});

export const apiCreateGitlab = createSchema.extend({
	applicationId: z.string().optional(),
	secret: z.string().optional(),
	groupName: z.string().optional(),
	gitProviderId: z.string().optional(),
	redirectUri: z.string().optional(),
});

export const apiCreateBitbucket = createSchema.extend({
	bitbucketUsername: z.string().optional(),
	appPassword: z.string().optional(),
	bitbucketWorkspaceName: z.string().optional(),
	gitProviderId: z.string().optional(),
});
