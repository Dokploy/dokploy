import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { account, organization } from "./account";
import { bitbucket } from "./bitbucket";
import { gitea } from "./gitea";
import { github } from "./github";
import { gitlab } from "./gitlab";

export const gitProviderType = pgEnum("gitProviderType", [
	"github",
	"gitlab",
	"bitbucket",
	"gitea",
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
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	userId: text("userId")
		.notNull()
		.references(() => account.userId, { onDelete: "cascade" }),
});

export const gitProviderRelations = relations(gitProvider, ({ one }) => ({
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
	gitea: one(gitea, {
		fields: [gitProvider.gitProviderId],
		references: [gitea.gitProviderId],
	}),
	organization: one(organization, {
		fields: [gitProvider.organizationId],
		references: [organization.id],
	}),
	account: one(account, {
		fields: [gitProvider.userId],
		references: [account.userId],
	}),
}));

const createSchema = createInsertSchema(gitProvider);

export const apiRemoveGitProvider = createSchema
	.extend({
		gitProviderId: z.string().min(1),
	})
	.pick({ gitProviderId: true });
