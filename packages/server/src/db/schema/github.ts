import { relations } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

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

export const apiCreateGithub = z.object({
	githubAppName: z.string().optional(),
	githubAppId: z.number().optional(),
	githubClientId: z.string().optional(),
	githubClientSecret: z.string().optional(),
	githubInstallationId: z.string().optional(),
	githubPrivateKey: z.string().optional(),
	githubWebhookSecret: z.string().nullable(),
	gitProviderId: z.string().optional(),
	name: z.string().min(1),
});

export const apiFindGithubBranches = z.object({
	repo: z.string().min(1),
	owner: z.string().min(1),
	githubId: z.string().optional(),
});

export const apiFindOneGithub = z.object({
	githubId: z.string().min(1),
});

export const apiUpdateGithub = z.object({
	githubId: z.string().min(1),
	name: z.string().min(1),
	gitProviderId: z.string().min(1),
	githubAppName: z.string().min(1),
});
