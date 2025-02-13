import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { admins } from "./admin";
import { bitbucket } from "./bitbucket";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { users_temp } from "./user";
// import { user } from "./user";

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
	// userId: text("userId").references(() => user.userId, {
	// 	onDelete: "cascade",
	// }),
	adminId: text("adminId")
		.notNull()
		.references(() => admins.adminId, { onDelete: "cascade" }),
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
	admin: one(admins, {
		fields: [gitProvider.adminId],
		references: [admins.adminId],
	}),
}));

const createSchema = createInsertSchema(gitProvider);

export const apiRemoveGitProvider = createSchema
	.extend({
		gitProviderId: z.string().min(1),
	})
	.pick({ gitProviderId: true });
