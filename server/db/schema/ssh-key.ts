import { applications } from "@/server/db/schema/application";
import { compose } from "@/server/db/schema/compose";
import { sshKeyCreate, sshKeyType } from "@/server/db/validations";
import { relations } from "drizzle-orm";
import { pgTable, text, time } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";

export const sshKeys = pgTable("ssh-key", {
	sshKeyId: text("sshKeyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	publicKey: text("publicKey").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	lastUsedAt: text("lastUsedAt"),
});

export const sshKeysRelations = relations(sshKeys, ({ many }) => ({
	applications: many(applications),
	compose: many(compose),
}));

const createSchema = createInsertSchema(
	sshKeys,
	/* Private key is not stored in the DB */
	sshKeyCreate.omit({ privateKey: true }).shape,
);

export const apiCreateSshKey = createSchema
	.pick({
		name: true,
		description: true,
		publicKey: true,
	})
	.merge(sshKeyCreate.pick({ privateKey: true }));

export const apiFindOneSshKey = createSchema
	.pick({
		sshKeyId: true,
	})
	.required();

export const apiGenerateSSHKey = sshKeyType;

export const apiRemoveSshKey = createSchema
	.pick({
		sshKeyId: true,
	})
	.required();

export const apiUpdateSshKey = createSchema
	.pick({
		name: true,
		description: true,
		lastUsedAt: true,
	})
	.partial()
	.merge(
		createSchema
			.pick({
				sshKeyId: true,
			})
			.required(),
	);
