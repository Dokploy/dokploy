import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { gpgKeyCreate, gpgKeyUpdate } from "../validations";
import { organization } from "./account";
import { backups } from "./backups";

export const gpgKeys = pgTable("gpg-key", {
        gpgKeyId: text("gpgKeyId")
                .notNull()
                .primaryKey()
                .$defaultFn(() => nanoid()),
        name: text("name").notNull(),
        description: text("description"),
        publicKey: text("publicKey").notNull(),
        privateKey: text("privateKey"),
        passphrase: text("passphrase"),
        createdAt: text("createdAt")
                .notNull()
                .$defaultFn(() => new Date().toISOString()),
        lastUsedAt: text("lastUsedAt"),
        organizationId: text("organizationId")
                .notNull()
                .references(() => organization.id, { onDelete: "cascade" }),
});

export const gpgKeysRelations = relations(gpgKeys, ({ many, one }) => ({
        backups: many(backups),
        organization: one(organization, {
                fields: [gpgKeys.organizationId],
                references: [organization.id],
        }),
}));

const createSchema = createInsertSchema(gpgKeys, gpgKeyCreate.shape);

export const apiCreateGpgKey = gpgKeyCreate.pick({
        name: true,
        description: true,
        publicKey: true,
        privateKey: true,
        passphrase: true,
});

export const apiFindOneGpgKey = createSchema
        .pick({
                gpgKeyId: true,
        })
        .required();

export const apiRemoveGpgKey = createSchema
        .pick({
                gpgKeyId: true,
        })
        .required();

export const apiUpdateGpgKey = createSchema
        .pick({
                gpgKeyId: true,
                name: true,
                description: true,
                publicKey: true,
                privateKey: true,
                passphrase: true,
                lastUsedAt: true,
        })
        .partial()
        .merge(
                gpgKeyUpdate
                        .pick({
                                name: true,
                                description: true,
                                publicKey: true,
                                privateKey: true,
                                passphrase: true,
                        })
                        .partial(),
        )
        .merge(
                createSchema
                        .pick({
                                gpgKeyId: true,
                        })
                        .required(),
        );
