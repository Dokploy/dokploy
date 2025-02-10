import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	is2FAEnabled: boolean("is2FAEnabled").notNull().default(false),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	resetPasswordToken: text("resetPasswordToken"),
	resetPasswordExpiresAt: text("resetPasswordExpiresAt"),
	confirmationToken: text("confirmationToken"),
	confirmationExpiresAt: text("confirmationExpiresAt"),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});
