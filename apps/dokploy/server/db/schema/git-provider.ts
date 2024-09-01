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
	github: one(githubProvider, {
		fields: [gitProvider.gitProviderId],
		references: [githubProvider.gitProviderId],
	}),
	gitlab: one(gitlabProvider, {
		fields: [gitProvider.gitProviderId],
		references: [gitlabProvider.gitProviderId],
	}),
	bitbucket: one(bitbucketProvider, {
		fields: [gitProvider.gitProviderId],
		references: [bitbucketProvider.gitProviderId],
	}),
	auth: one(auth, {
		fields: [gitProvider.authId],
		references: [auth.id],
	}),
}));

export const githubProvider = pgTable("github_provider", {
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

export const githubProviderRelations = relations(
	githubProvider,
	({ one, }) => ({
		gitProvider: one(gitProvider, {
			fields: [githubProvider.gitProviderId],
			references: [gitProvider.gitProviderId],
		}),
	}),
);

export const gitlabProvider = pgTable("gitlab_provider", {
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

export const gitlabProviderRelations = relations(
	gitlabProvider,
	({ one}) => ({
		gitProvider: one(gitProvider, {
			fields: [gitlabProvider.gitProviderId],
			references: [gitProvider.gitProviderId],
		}),
	}),
);

export const bitbucketProvider = pgTable("bitbucket_provider", {
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

export const bitbucketProviderRelations = relations(
	bitbucketProvider,
	({ one }) => ({
		gitProvider: one(gitProvider, {
			fields: [bitbucketProvider.gitProviderId],
			references: [gitProvider.gitProviderId],
		}),
	}),
);

const createSchema = createInsertSchema(gitProvider);

export const apiCreateGithubProvider = createSchema.extend({
	githubAppName: z.string().optional(),
	githubAppId: z.number().optional(),
	githubClientId: z.string().optional(),
	githubClientSecret: z.string().optional(),
	githubInstallationId: z.string().optional(),
	githubPrivateKey: z.string().optional(),
	githubWebhookSecret: z.string().nullable(),
	gitProviderId: z.string().optional(),
});

export const apiCreateGitlabProvider = createSchema.extend({
	applicationId: z.string().optional(),
	secret: z.string().optional(),
	groupName: z.string().optional(),
	gitProviderId: z.string().optional(),
	redirectUri: z.string().optional(),
});

export const apiCreateBitbucketProvider = createSchema.extend({
	bitbucketUsername: z.string().optional(),
	appPassword: z.string().optional(),
	bitbucketWorkspaceName: z.string().optional(),
	gitProviderId: z.string().optional(),
});
