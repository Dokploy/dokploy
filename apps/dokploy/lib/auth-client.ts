import { ssoClient } from "@better-auth/sso/client";
import {
	adminClient,
	apiKeyClient,
	inferAdditionalFields,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // the base url of your auth server
	plugins: [
		organizationClient(),
		twoFactorClient(),
		apiKeyClient(),
		ssoClient(),
		adminClient(),
		inferAdditionalFields({
			user: {
				lastName: {
					type: "string",
				},
			},
		}),
	],
});
