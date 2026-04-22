import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organization } from "./account";
import { user } from "./user";

export const ssoProvider = pgTable("sso_provider", {
	id: text("id").primaryKey(),
	issuer: text("issuer").notNull(),
	oidcConfig: text("oidc_config"),
	samlConfig: text("saml_config"),
	providerId: text("provider_id").notNull().unique(),
	userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
	organizationId: text("organization_id").references(() => organization.id, {
		onDelete: "cascade",
	}),
	domain: text("domain").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
	organization: one(organization, {
		fields: [ssoProvider.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [ssoProvider.userId],
		references: [user.id],
	}),
}));
const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
export const ssoProviderBodySchema = z.object({
	providerId: z.string({}),
	issuer: z.string({}),
	domains: z
		.string()
		.array()
		.transform((val) =>
			Array.from(
				new Set(val.map((d) => d.trim().toLowerCase()).filter(Boolean)),
			),
		)
		.refine((val) => val.every((d) => domainRegex.test(d)), {
			message: "Invalid domain",
			path: ["domains"],
		}),
	oidcConfig: z
		.object({
			clientId: z.string({}),
			clientSecret: z.string({}),
			authorizationEndpoint: z.string({}).optional(),
			tokenEndpoint: z.string({}).optional(),
			userInfoEndpoint: z.string({}).optional(),
			tokenEndpointAuthentication: z
				.enum(["client_secret_post", "client_secret_basic"])
				.optional(),
			jwksEndpoint: z.string({}).optional(),
			discoveryEndpoint: z.string().optional(),
			skipDiscovery: z.boolean().optional(),
			scopes: z.array(z.string()).optional(),
			pkce: z.boolean().default(true).optional(),
			mapping: z
				.object({
					id: z.string({}),
					email: z.string({}),
					emailVerified: z.string({}).optional(),
					name: z.string({}),
					image: z.string({}).optional(),
					extraFields: z.record(z.string(), z.any()).optional(),
				})
				.optional(),
		})
		.optional(),
	samlConfig: z
		.object({
			entryPoint: z.string({}),
			cert: z.string({}),
			callbackUrl: z.string({}),
			audience: z.string().optional(),
			idpMetadata: z
				.object({
					metadata: z.string().optional(),
					entityID: z.string().optional(),
					cert: z.string().optional(),
					privateKey: z.string().optional(),
					privateKeyPass: z.string().optional(),
					isAssertionEncrypted: z.boolean().optional(),
					encPrivateKey: z.string().optional(),
					encPrivateKeyPass: z.string().optional(),
					singleSignOnService: z
						.array(
							z.object({
								Binding: z.string(),
								Location: z.string(),
							}),
						)
						.optional(),
				})
				.optional(),
			spMetadata: z.object({
				metadata: z.string().optional(),
				entityID: z.string().optional(),
				binding: z.string().optional(),
				privateKey: z.string().optional(),
				privateKeyPass: z.string().optional(),
				isAssertionEncrypted: z.boolean().optional(),
				encPrivateKey: z.string().optional(),
				encPrivateKeyPass: z.string().optional(),
			}),
			wantAssertionsSigned: z.boolean().optional(),
			authnRequestsSigned: z.boolean().optional(),
			signatureAlgorithm: z.string().optional(),
			digestAlgorithm: z.string().optional(),
			identifierFormat: z.string().optional(),
			privateKey: z.string().optional(),
			decryptionPvk: z.string().optional(),
			additionalParams: z.record(z.string(), z.any()).optional(),
			mapping: z
				.object({
					id: z.string({}),
					email: z.string({}),
					emailVerified: z.string({}).optional(),
					name: z.string({}),
					firstName: z.string({}).optional(),
					lastName: z.string({}).optional(),
					extraFields: z.record(z.string(), z.any()).optional(),
				})
				.optional(),
		})
		.optional(),
	organizationId: z.string({}).optional(),
	overrideUserInfo: z.boolean({}).default(false).optional(),
});
