// import { relations } from "drizzle-orm";
// import {
// 	pgTable,
// 	text,
// 	timestamp,
// 	boolean,
// 	integer,
// 	index,
// 	uniqueIndex,
// } from "drizzle-orm/pg-core";

// export const user = pgTable("user", {
// 	id: text("id").primaryKey(),
// 	firstName: text("first_name").notNull(),
// 	email: text("email").notNull().unique(),
// 	emailVerified: boolean("email_verified").default(false).notNull(),
// 	image: text("image"),
// 	createdAt: timestamp("created_at").defaultNow().notNull(),
// 	updatedAt: timestamp("updated_at")
// 		.defaultNow()
// 		.$onUpdate(() => /* @__PURE__ */ new Date())
// 		.notNull(),
// 	twoFactorEnabled: boolean("two_factor_enabled").default(false),
// 	role: text("role"),
// 	ownerId: text("owner_id"),
// 	allowImpersonation: boolean("allow_impersonation").default(false),
// 	lastName: text("last_name").default(""),
// });

// export const session = pgTable(
// 	"session",
// 	{
// 		id: text("id").primaryKey(),
// 		expiresAt: timestamp("expires_at").notNull(),
// 		token: text("token").notNull().unique(),
// 		createdAt: timestamp("created_at").defaultNow().notNull(),
// 		updatedAt: timestamp("updated_at")
// 			.$onUpdate(() => /* @__PURE__ */ new Date())
// 			.notNull(),
// 		ipAddress: text("ip_address"),
// 		userAgent: text("user_agent"),
// 		userId: text("user_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 		activeOrganizationId: text("active_organization_id"),
// 	},
// 	(table) => [index("session_userId_idx").on(table.userId)],
// );

// export const account = pgTable(
// 	"account",
// 	{
// 		id: text("id").primaryKey(),
// 		accountId: text("account_id").notNull(),
// 		providerId: text("provider_id").notNull(),
// 		userId: text("user_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 		accessToken: text("access_token"),
// 		refreshToken: text("refresh_token"),
// 		idToken: text("id_token"),
// 		accessTokenExpiresAt: timestamp("access_token_expires_at"),
// 		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
// 		scope: text("scope"),
// 		password: text("password"),
// 		createdAt: timestamp("created_at").defaultNow().notNull(),
// 		updatedAt: timestamp("updated_at")
// 			.$onUpdate(() => /* @__PURE__ */ new Date())
// 			.notNull(),
// 	},
// 	(table) => [index("account_userId_idx").on(table.userId)],
// );

// export const verification = pgTable(
// 	"verification",
// 	{
// 		id: text("id").primaryKey(),
// 		identifier: text("identifier").notNull(),
// 		value: text("value").notNull(),
// 		expiresAt: timestamp("expires_at").notNull(),
// 		createdAt: timestamp("created_at").defaultNow().notNull(),
// 		updatedAt: timestamp("updated_at")
// 			.defaultNow()
// 			.$onUpdate(() => /* @__PURE__ */ new Date())
// 			.notNull(),
// 	},
// 	(table) => [index("verification_identifier_idx").on(table.identifier)],
// );

// export const apikey = pgTable(
// 	"apikey",
// 	{
// 		id: text("id").primaryKey(),
// 		name: text("name"),
// 		start: text("start"),
// 		prefix: text("prefix"),
// 		key: text("key").notNull(),
// 		userId: text("user_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 		refillInterval: integer("refill_interval"),
// 		refillAmount: integer("refill_amount"),
// 		lastRefillAt: timestamp("last_refill_at"),
// 		enabled: boolean("enabled").default(true),
// 		rateLimitEnabled: boolean("rate_limit_enabled").default(true),
// 		rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
// 		rateLimitMax: integer("rate_limit_max").default(10),
// 		requestCount: integer("request_count").default(0),
// 		remaining: integer("remaining"),
// 		lastRequest: timestamp("last_request"),
// 		expiresAt: timestamp("expires_at"),
// 		createdAt: timestamp("created_at").notNull(),
// 		updatedAt: timestamp("updated_at").notNull(),
// 		permissions: text("permissions"),
// 		metadata: text("metadata"),
// 	},
// 	(table) => [
// 		index("apikey_key_idx").on(table.key),
// 		index("apikey_userId_idx").on(table.userId),
// 	],
// );

// export const ssoProvider = pgTable("sso_provider", {
// 	id: text("id").primaryKey(),
// 	issuer: text("issuer").notNull(),
// 	oidcConfig: text("oidc_config"),
// 	samlConfig: text("saml_config"),
// 	userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
// 	providerId: text("provider_id").notNull().unique(),
// 	organizationId: text("organization_id"),
// 	domain: text("domain").notNull(),
// });

// export const twoFactor = pgTable(
// 	"two_factor",
// 	{
// 		id: text("id").primaryKey(),
// 		secret: text("secret").notNull(),
// 		backupCodes: text("backup_codes").notNull(),
// 		userId: text("user_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 	},
// 	(table) => [
// 		index("twoFactor_secret_idx").on(table.secret),
// 		index("twoFactor_userId_idx").on(table.userId),
// 	],
// );

// export const organization = pgTable(
// 	"organization",
// 	{
// 		id: text("id").primaryKey(),
// 		name: text("name").notNull(),
// 		slug: text("slug").notNull().unique(),
// 		logo: text("logo"),
// 		createdAt: timestamp("created_at").notNull(),
// 		metadata: text("metadata"),
// 	},
// 	(table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
// );

// export const member = pgTable(
// 	"member",
// 	{
// 		id: text("id").primaryKey(),
// 		organizationId: text("organization_id")
// 			.notNull()
// 			.references(() => organization.id, { onDelete: "cascade" }),
// 		userId: text("user_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 		role: text("role").default("member").notNull(),
// 		createdAt: timestamp("created_at").notNull(),
// 	},
// 	(table) => [
// 		index("member_organizationId_idx").on(table.organizationId),
// 		index("member_userId_idx").on(table.userId),
// 	],
// );

// export const invitation = pgTable(
// 	"invitation",
// 	{
// 		id: text("id").primaryKey(),
// 		organizationId: text("organization_id")
// 			.notNull()
// 			.references(() => organization.id, { onDelete: "cascade" }),
// 		email: text("email").notNull(),
// 		role: text("role"),
// 		status: text("status").default("pending").notNull(),
// 		expiresAt: timestamp("expires_at").notNull(),
// 		createdAt: timestamp("created_at").defaultNow().notNull(),
// 		inviterId: text("inviter_id")
// 			.notNull()
// 			.references(() => user.id, { onDelete: "cascade" }),
// 	},
// 	(table) => [
// 		index("invitation_organizationId_idx").on(table.organizationId),
// 		index("invitation_email_idx").on(table.email),
// 	],
// );

// export const userRelations = relations(user, ({ many }) => ({
// 	sessions: many(session),
// 	accounts: many(account),
// 	apikeys: many(apikey),
// 	ssoProviders: many(ssoProvider),
// 	twoFactors: many(twoFactor),
// 	members: many(member),
// 	invitations: many(invitation),
// }));

// export const sessionRelations = relations(session, ({ one }) => ({
// 	user: one(user, {
// 		fields: [session.userId],
// 		references: [user.id],
// 	}),
// }));

// export const accountRelations = relations(account, ({ one }) => ({
// 	user: one(user, {
// 		fields: [account.userId],
// 		references: [user.id],
// 	}),
// }));

// export const apikeyRelations = relations(apikey, ({ one }) => ({
// 	user: one(user, {
// 		fields: [apikey.userId],
// 		references: [user.id],
// 	}),
// }));

// export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
// 	user: one(user, {
// 		fields: [ssoProvider.userId],
// 		references: [user.id],
// 	}),
// }));

// export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
// 	user: one(user, {
// 		fields: [twoFactor.userId],
// 		references: [user.id],
// 	}),
// }));

// export const organizationRelations = relations(organization, ({ many }) => ({
// 	members: many(member),
// 	invitations: many(invitation),
// }));

// export const memberRelations = relations(member, ({ one }) => ({
// 	organization: one(organization, {
// 		fields: [member.organizationId],
// 		references: [organization.id],
// 	}),
// 	user: one(user, {
// 		fields: [member.userId],
// 		references: [user.id],
// 	}),
// }));

// export const invitationRelations = relations(invitation, ({ one }) => ({
// 	organization: one(organization, {
// 		fields: [invitation.organizationId],
// 		references: [organization.id],
// 	}),
// 	user: one(user, {
// 		fields: [invitation.inviterId],
// 		references: [user.id],
// 	}),
// }));
