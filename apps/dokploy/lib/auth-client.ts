import {
	adminClient,
	apiKeyClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // the base url of your auth server
	plugins: [
		organizationClient(),
		twoFactorClient(),
		apiKeyClient(),
		adminClient(),
		ssoClient(),
	],
});
