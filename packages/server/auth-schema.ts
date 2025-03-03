// import {
// 	pgTable,
// 	text,
// 	integer,
// 	timestamp,
// 	boolean,
// } from "drizzle-orm/pg-core";

// export const users_temp = pgTable("users_temp", {
// 	id: text("id").primaryKey(),
// 	name: text("name").notNull(),
// 	email: text("email").notNull().unique(),
// 	emailVerified: boolean("email_verified").notNull(),
// 	image: text("image"),
// 	createdAt: timestamp("created_at").notNull(),
// 	updatedAt: timestamp("updated_at").notNull(),
// 	twoFactorEnabled: boolean("two_factor_enabled"),
// 	role: text("role"),
// 	ownerId: text("owner_id"),
// });

// export const session = pgTable("session", {
// 	id: text("id").primaryKey(),
// 	expiresAt: timestamp("expires_at").notNull(),
// 	token: text("token").notNull().unique(),
// 	createdAt: timestamp("created_at").notNull(),
// 	updatedAt: timestamp("updated_at").notNull(),
// 	ipAddress: text("ip_address"),
// 	userAgent: text("user_agent"),
// 	userId: text("user_id")
// 		.notNull()
// 		.references(() => users_temp.id, { onDelete: "cascade" }),
// 	activeOrganizationId: text("active_organization_id"),
// });

// export const account = pgTable("account", {
// 	id: text("id").primaryKey(),
// 	accountId: text("account_id").notNull(),
// 	providerId: text("provider_id").notNull(),
// 	userId: text("user_id")
// 		.notNull()
// 		.references(() => users_temp.id, { onDelete: "cascade" }),
// 	accessToken: text("access_token"),
// 	refreshToken: text("refresh_token"),
// 	idToken: text("id_token"),
// 	accessTokenExpiresAt: timestamp("access_token_expires_at"),
// 	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
// 	scope: text("scope"),
// 	password: text("password"),
// 	createdAt: timestamp("created_at").notNull(),
// 	updatedAt: timestamp("updated_at").notNull(),
// });

// export const verification = pgTable("verification", {
// 	id: text("id").primaryKey(),
// 	identifier: text("identifier").notNull(),
// 	value: text("value").notNull(),
// 	expiresAt: timestamp("expires_at").notNull(),
// 	createdAt: timestamp("created_at"),
// 	updatedAt: timestamp("updated_at"),
// });

// export const apikey = pgTable("apikey", {
// 	id: text("id").primaryKey(),
// 	name: text("name"),
// 	start: text("start"),
// 	prefix: text("prefix"),
// 	key: text("key").notNull(),
// 	userId: text("user_id")
// 		.notNull()
// 		.references(() => user.id, { onDelete: "cascade" }),
// 	refillInterval: integer("refill_interval"),
// 	refillAmount: integer("refill_amount"),
// 	lastRefillAt: timestamp("last_refill_at"),
// 	enabled: boolean("enabled"),
// 	rateLimitEnabled: boolean("rate_limit_enabled"),
// 	rateLimitTimeWindow: integer("rate_limit_time_window"),
// 	rateLimitMax: integer("rate_limit_max"),
// 	requestCount: integer("request_count"),
// 	remaining: integer("remaining"),
// 	lastRequest: timestamp("last_request"),
// 	expiresAt: timestamp("expires_at"),
// 	createdAt: timestamp("created_at").notNull(),
// 	updatedAt: timestamp("updated_at").notNull(),
// 	permissions: text("permissions"),
// 	metadata: text("metadata"),
// });

// export const twoFactor = pgTable("two_factor", {
// 	id: text("id").primaryKey(),
// 	secret: text("secret").notNull(),
// 	backupCodes: text("backup_codes").notNull(),
// 	userId: text("user_id")
// 		.notNull()
// 		.references(() => user.id, { onDelete: "cascade" }),
// });

// export const organization = pgTable("organization", {
// 	id: text("id").primaryKey(),
// 	name: text("name").notNull(),
// 	slug: text("slug").unique(),
// 	logo: text("logo"),
// 	createdAt: timestamp("created_at").notNull(),
// 	metadata: text("metadata"),
// });

// export const member = pgTable("member", {
// 	id: text("id").primaryKey(),
// 	organizationId: text("organization_id")
// 		.notNull()
// 		.references(() => organization.id, { onDelete: "cascade" }),
// 	userId: text("user_id")
// 		.notNull()
// 		.references(() => user.id, { onDelete: "cascade" }),
// 	role: text("role").notNull(),
// 	teamId: text("team_id"),
// 	createdAt: timestamp("created_at").notNull(),
// });

// export const invitation = pgTable("invitation", {
// 	id: text("id").primaryKey(),
// 	organizationId: text("organization_id")
// 		.notNull()
// 		.references(() => organization.id, { onDelete: "cascade" }),
// 	email: text("email").notNull(),
// 	role: text("role"),
// 	teamId: text("team_id"),
// 	status: text("status").notNull(),
// 	expiresAt: timestamp("expires_at").notNull(),
// 	inviterId: text("inviter_id")
// 		.notNull()
// 		.references(() => user.id, { onDelete: "cascade" }),
// });
