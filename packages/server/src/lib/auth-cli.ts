import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, organization, twoFactor } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";
import { ac, adminRole, memberRole, ownerRole } from "./access-control";

// CLI-only config for `@better-auth/cli generate` — must mirror the plugin set
// in auth.ts. Never import this from runtime code.
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	user: {
		modelName: "user",
		fields: {
			name: "firstName",
		},
		additionalFields: {
			role: { type: "string", input: false },
			ownerId: { type: "string", input: false },
			allowImpersonation: { type: "boolean", defaultValue: false },
			lastName: { type: "string", required: false, defaultValue: "" },
			enableEnterpriseFeatures: { type: "boolean", required: false },
			isValidEnterpriseLicense: { type: "boolean", required: false },
		},
	},
	plugins: [
		jwt(),
		oauthProvider({
			loginPage: "/",
			consentPage: "/mcp/consent",
			scopes: ["dokploy", "offline_access"],
			grantTypes: ["authorization_code", "refresh_token"],
			validAudiences: process.env.DOKPLOY_MCP_RESOURCE_URL
				? [process.env.DOKPLOY_MCP_RESOURCE_URL]
				: undefined,
			accessTokenExpiresIn: 900,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			clientRegistrationDefaultScopes: ["dokploy"],
			clientRegistrationAllowedScopes: ["dokploy", "offline_access"],
		}),
		apiKey({ enableMetadata: true, references: "user" }),
		sso({
			trustEmailVerified: true,
			domainVerification: {
				enabled: true,
			},
		}),
		twoFactor(),
		passkey(),
		organization({
			ac,
			roles: { owner: ownerRole, admin: adminRole, member: memberRole },
			dynamicAccessControl: {
				enabled: true,
				maximumRolesPerOrganization: 10,
			},
		}),
		scim(),
		admin(),
	],
});
