import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
export const users = pgTable("user", {
	id: uuid("id").defaultRandom().primaryKey(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
	otpCode: text("otp_code"),
	otpCodeExpiresAt: timestamp("otp_code_expires_at"),
	temporalId: text("temporal_id"),
	temporalIdExpiresAt: timestamp("temporal_id_expires_at"),
});

export const usersRelations = relations(users, ({ many }) => ({
	licenses: many(licenses),
}));

export const licenses = pgTable("licenses", {
	id: uuid("id").defaultRandom().primaryKey(),
	productId: text("product_id").notNull(),
	licenseKey: text("license_key").notNull().unique(),
	serverIps: text("server_ips").array(),
	activatedAt: timestamp("activated_at"),
	lastVerifiedAt: timestamp("last_verified_at"),
	stripeCustomerId: text("stripeCustomerId").notNull(),

	stripeSubscriptionId: text("stripeSubscriptionId").notNull(),
	createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
	metadata: text("metadata"),
	userId: uuid("user_id").references(() => users.id),
});

export const licensesRelations = relations(licenses, ({ one }) => ({
	user: one(users, {
		fields: [licenses.userId],
		references: [users.id],
	}),
}));

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
