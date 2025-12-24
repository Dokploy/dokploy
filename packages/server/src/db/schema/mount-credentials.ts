import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { mounts } from "./mount";

export const mountCredentials = pgTable("mount_credentials", {
	credentialsId: text("credentialsId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	mountId: text("mountId")
		.notNull()
		.references(() => mounts.mountId, { onDelete: "cascade" }),
	username: text("username").notNull(), // Encrypted
	password: text("password").notNull(), // Encrypted
	domain: text("domain"), // For SMB
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text("updatedAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const mountCredentialsRelations = relations(
	mountCredentials,
	({ one }) => ({
		mount: one(mounts, {
			fields: [mountCredentials.mountId],
			references: [mounts.mountId],
		}),
	}),
);

export const apiCreateMountCredentials = createInsertSchema(
	mountCredentials,
	{
		credentialsId: z.string().optional(),
		mountId: z.string().min(1),
		username: z.string().min(1),
		password: z.string().min(1),
		domain: z.string().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
	},
);

export const apiUpdateMountCredentials = apiCreateMountCredentials
	.partial()
	.extend({
		credentialsId: z.string().min(1),
	});

