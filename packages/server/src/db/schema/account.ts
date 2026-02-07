import { relations, sql } from "drizzle-orm";
import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { projects } from "./project";
import { server } from "./server";
import { ssoProvider } from "./sso";
import { user } from "./user";

export const account = pgTable("account", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	accountId: text("account_id")
		.notNull()
		.$defaultFn(() => nanoid()),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
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

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

export const organization = pgTable("organization", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	logo: text("logo"),
	createdAt: timestamp("created_at").notNull(),
	metadata: text("metadata"),
	ownerId: text("owner_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const organizationRelations = relations(
	organization,
	({ one, many }) => ({
		owner: one(user, {
			fields: [organization.ownerId],
			references: [user.id],
		}),
		servers: many(server),
		projects: many(projects),
		members: many(member),
		ssoProviders: many(ssoProvider),
	}),
);

export const member = pgTable("member", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: text("role").notNull().$type<"owner" | "member" | "admin">(),
	createdAt: timestamp("created_at").notNull(),
	teamId: text("team_id"),
	isDefault: boolean("is_default").notNull().default(false),
	// Permissions
	canCreateProjects: boolean("canCreateProjects").notNull().default(false),
	canAccessToSSHKeys: boolean("canAccessToSSHKeys").notNull().default(false),
	canCreateServices: boolean("canCreateServices").notNull().default(false),
	canDeleteProjects: boolean("canDeleteProjects").notNull().default(false),
	canDeleteServices: boolean("canDeleteServices").notNull().default(false),
	canAccessToDocker: boolean("canAccessToDocker").notNull().default(false),
	canAccessToAPI: boolean("canAccessToAPI").notNull().default(false),
	canAccessToGitProviders: boolean("canAccessToGitProviders")
		.notNull()
		.default(false),
	canAccessToTraefikFiles: boolean("canAccessToTraefikFiles")
		.notNull()
		.default(false),
	canDeleteEnvironments: boolean("canDeleteEnvironments")
		.notNull()
		.default(false),
	canCreateEnvironments: boolean("canCreateEnvironments")
		.notNull()
		.default(false),
	accessedProjects: text("accesedProjects")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	accessedEnvironments: text("accessedEnvironments")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
	accessedServices: text("accesedServices")
		.array()
		.notNull()
		.default(sql`ARRAY[]::text[]`),
});

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role").$type<"owner" | "member" | "admin">(),
	status: text("status").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	teamId: text("team_id"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
}));

export const twoFactor = pgTable("two_factor", {
	id: text("id").primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backup_codes").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const apikey = pgTable("apikey", {
	id: text("id").primaryKey(),
	name: text("name"),
	start: text("start"),
	prefix: text("prefix"),
	key: text("key").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	refillInterval: integer("refill_interval"),
	refillAmount: integer("refill_amount"),
	lastRefillAt: timestamp("last_refill_at"),
	enabled: boolean("enabled"),
	rateLimitEnabled: boolean("rate_limit_enabled"),
	rateLimitTimeWindow: integer("rate_limit_time_window"),
	rateLimitMax: integer("rate_limit_max"),
	requestCount: integer("request_count"),
	remaining: integer("remaining"),
	lastRequest: timestamp("last_request"),
	expiresAt: timestamp("expires_at"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	permissions: text("permissions"),
	metadata: text("metadata"),
});

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id],
	}),
}));
