import { relations } from "drizzle-orm";
import { pgEnum, pgTable, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";
import { organization } from "./account";

export const domainProviderType = pgEnum("domainProviderType", [
	"netlify",
	"namecheap",
]);

export const netlifyAuthMethod = pgEnum("netlifyAuthMethod", [
	"oauth",
	"direct",
]);

export const domainProviders = pgTable("domain_provider", {
	domainProviderId: text("domainProviderId")
		.notNull()
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	type: domainProviderType("type").notNull(),
	apiKey: text("apiKey"),
	// Netlify specific
	apiToken: text("apiToken"), // Direct access token
	clientId: text("clientId"), // OAuth client ID
	clientSecret: text("clientSecret"), // OAuth client secret
	accessToken: text("accessToken"), // OAuth access token
	refreshToken: text("refreshToken"), // OAuth refresh token
	tokenExpiresAt: text("tokenExpiresAt"), // OAuth token expiration
	authMethod: netlifyAuthMethod("authMethod"), // "oauth" or "direct"
	// Namecheap specific
	apiUser: text("apiUser"),
	clientIp: text("clientIp"),
	enablePurchase: boolean("enablePurchase").notNull().default(false),
	organizationId: text("organizationId")
		.notNull()
		.references(() => organization.id, {
			onDelete: "cascade",
		}),
	active: boolean("active").notNull().default(true),
	createdAt: text("createdAt")
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
});

export const domainProvidersRelations = relations(domainProviders, ({ one }) => ({
	organization: one(organization, {
		fields: [domainProviders.organizationId],
		references: [organization.id],
	}),
}));

// Base schema for Netlify providers
const netlifyProviderBaseSchema = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.literal("netlify"),
	authMethod: z.enum(["oauth", "direct"]),
});

// OAuth-specific fields
const netlifyOAuthSchema = netlifyProviderBaseSchema.extend({
	authMethod: z.literal("oauth"),
	clientId: z.string().min(1, "Client ID is required for OAuth"),
	clientSecret: z.string().min(1, "Client Secret is required for OAuth"),
});

// Direct auth-specific fields
const netlifyDirectSchema = netlifyProviderBaseSchema.extend({
	authMethod: z.literal("direct"),
	apiToken: z.string().min(1, "Access Token is required for direct auth"),
});

// Combined Netlify schema using discriminated union on authMethod
const netlifyProviderSchema = z.discriminatedUnion("authMethod", [
	netlifyOAuthSchema,
	netlifyDirectSchema,
]);

const namecheapProviderSchema = z.object({
	name: z.string().min(1, "Name is required"),
	type: z.literal("namecheap"),
	apiKey: z.string().min(1, "API Key is required"),
	apiUser: z.string().min(1, "API User is required"),
	clientIp: z.string().min(1, "Client IP is required"),
	enablePurchase: z.boolean().default(false),
});

export const apiCreateDomainProvider = z.union([
	// OAuth Netlify
	z.object({
		name: z.string().min(1, "Name is required"),
		type: z.literal("netlify"),
		authMethod: z.literal("oauth"),
		clientId: z.string().min(1, "Client ID is required for OAuth"),
		clientSecret: z.string().min(1, "Client Secret is required for OAuth"),
	}),
	// Direct Netlify
	z.object({
		name: z.string().min(1, "Name is required"),
		type: z.literal("netlify"),
		authMethod: z.literal("direct"),
		apiToken: z.string().min(1, "Access Token is required for direct auth"),
	}),
	// Namecheap
	namecheapProviderSchema,
]);

export const apiUpdateDomainProvider = z.object({
	domainProviderId: z.string(),
	name: z.string().optional(),
	type: z.enum(["netlify", "namecheap"]).optional(),
	authMethod: z.enum(["oauth", "direct"]).optional(),
	// General API credentials
	apiKey: z.string().optional(),
	// Netlify specific
	apiToken: z.string().optional(),
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	accessToken: z.string().optional(),
	refreshToken: z.string().optional(),
	tokenExpiresAt: z.string().optional(),
	// Namecheap specific
	apiUser: z.string().optional(),
	clientIp: z.string().optional(),
	enablePurchase: z.boolean().optional(),
});

// Provider-specific schemas for type safety
export const netlifyProviderConfig = z.union([
	netlifyOAuthSchema.omit({ name: true, type: true }),
	netlifyDirectSchema.omit({ name: true, type: true }),
]);

export const namecheapProviderConfig = namecheapProviderSchema.omit({ name: true, type: true });