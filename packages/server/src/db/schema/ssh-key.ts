import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { sshKeyCreate, sshKeyType } from "../validations";
import { organization } from "./account";
import { applications } from "./application";
import { compose } from "./compose";
import { server } from "./server";

export const sshKeys = pgTable("ssh-key", {
	sshKeyId: text("sshKeyId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	privateKey: text("privateKey").notNull().default(""),
	publicKey: text("publicKey").notNull(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	lastUsedAt: text("lastUsedAt"),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
});

export const sshKeysRelations = relations(sshKeys, ({ many, one }) => ({
	applications: many(applications),
	compose: many(compose),
	servers: many(server),
	organization: one(organization, {
		fields: [sshKeys.organizationId],
		references: [organization.id],
	}),
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
		privateKey: true,
		publicKey: true,
		organizationId: true,
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
