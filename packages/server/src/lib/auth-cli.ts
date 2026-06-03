import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, twoFactor } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";
import { ac, adminRole, memberRole, ownerRole } from "./access-control";
import { betterAuthSecret } from "./auth-secret";

/**
 * Minimal auth config for `@better-auth/cli generate` only.
 * Mirrors plugin set from auth.ts without session hooks or email handlers.
 */
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	secret: betterAuthSecret,
	appName: "Dokploy",
	user: {
		modelName: "user",
		fields: {
			name: "firstName",
		},
		additionalFields: {
			role: { type: "string", input: false },
			ownerId: { type: "string", input: false },
			allowImpersonation: {
				fieldName: "allowImpersonation",
				type: "boolean",
				defaultValue: false,
			},
			lastName: {
				type: "string",
				required: false,
				input: true,
				defaultValue: "",
			},
			enableEnterpriseFeatures: {
				type: "boolean",
				required: false,
				input: false,
			},
			isValidEnterpriseLicense: {
				type: "boolean",
				required: false,
				input: false,
			},
		},
	},
	plugins: [
		apiKey({
			enableMetadata: true,
			references: "user",
		}),
		sso(),
		twoFactor(),
		passkey({
			rpID: "localhost",
			rpName: "Dokploy",
			origin: "http://localhost:3000",
		}),
		organization({
			ac,
			roles: {
				owner: ownerRole,
				admin: adminRole,
				member: memberRole,
			},
			dynamicAccessControl: {
				enabled: true,
				maximumRolesPerOrganization: 10,
			},
		}),
	],
});
