import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { gitProvider } from "./git-provider";

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

const createSchema = createInsertSchema(bitbucket);

export const apiCreateBitbucket = createSchema.extend({
	bitbucketUsername: z.string().optional(),
	appPassword: z.string().optional(),
	bitbucketWorkspaceName: z.string().optional(),
	gitProviderId: z.string().optional(),
	authId: z.string().min(1),
	name: z.string().min(1),
});

export const apiFindOneBitbucket = createSchema
	.extend({
		bitbucketId: z.string().min(1),
	})
	.pick({ bitbucketId: true });

export const apiBitbucketTestConnection = createSchema
	.extend({
		bitbucketId: z.string().min(1),
		bitbucketUsername: z.string().optional(),
		workspaceName: z.string().optional(),
	})
	.pick({ bitbucketId: true, bitbucketUsername: true, workspaceName: true });

export const apiFindBitbucketBranches = z.object({
	owner: z.string(),
	repo: z.string(),
	bitbucketId: z.string().optional(),
});

export const apiUpdateBitbucket = createSchema.extend({
	bitbucketId: z.string().min(1),
	name: z.string().min(1),
	bitbucketUsername: z.string().optional(),
	bitbucketWorkspaceName: z.string().optional(),
	organizationId: z.string().optional(),
});
