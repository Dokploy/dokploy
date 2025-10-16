import { nanoid } from "nanoid";
import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const oidcSettings = pgTable("oidc_settings", {
	id: text("id")
		.primaryKey()
		.notNull()
		.$defaultFn(() => nanoid()),
	enabled: boolean("enabled").notNull().default(false),
	providerId: text("provider_id").notNull(),
	displayName: text("display_name").notNull().default("OpenID Connect"),
	domain: text("domain"),
	issuer: text("issuer").notNull(),
	discoveryUrl: text("discovery_url").notNull(),
	clientId: text("client_id").notNull(),
	clientSecret: text("client_secret").notNull(),
	scopes: text("scopes").array().$type<string[]>().notNull().default(["openid", "email", "profile"]),
	pkce: boolean("pkce").notNull().default(true),
	overrideUserInfo: boolean("override_user_info").notNull().default(false),
	mapping: jsonb("mapping")
		.notNull()
		.$type<{
			id: string;
			email: string;
			emailVerified?: string;
			name: string;
			image?: string;
			[key: string]: unknown;
		}>()
		.default({
			id: "sub",
			email: "email",
			emailVerified: "email_verified",
			name: "name",
			image: "picture",
		}),
	createdAt: timestamp("created_at", { mode: "date" })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { mode: "date" })
		.notNull()
		.defaultNow(),
});

export type OidcSettings = typeof oidcSettings.$inferSelect;
