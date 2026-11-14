import { relations } from "drizzle-orm";
import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { applications } from "./application";
import { encryptedText } from "./utils";

// No environmentId or serverId column: a Studio's scope is read from its
// application row, so a moved or transferred Studio follows its application.
export const libredbStudio = pgTable("libredb_studio", {
	libredbStudioId: text("libredbStudioId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	applicationId: text("applicationId")
		.notNull()
		.unique()
		.references(() => applications.applicationId, { onDelete: "cascade" }),
	allowCustomConnections: boolean("allowCustomConnections")
		.notNull()
		.default(false),
	seedHash: text("seedHash"),
	lastSyncedAt: text("lastSyncedAt"),
	lastSyncError: text("lastSyncError"),
	// Kept out of the application env, which application.one returns decrypted
	// to every member with read access; JWT_SECRET alone forges a Studio session.
	launchSecret: encryptedText("launchSecret").notNull(),
	jwtSecret: encryptedText("jwtSecret").notNull(),
	adminPassword: encryptedText("adminPassword").notNull(),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const libredbStudioRelations = relations(libredbStudio, ({ one }) => ({
	application: one(applications, {
		fields: [libredbStudio.applicationId],
		references: [applications.applicationId],
	}),
}));

export type LibredbStudio = typeof libredbStudio.$inferSelect;
