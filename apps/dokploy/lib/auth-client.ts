import { organizationClient } from "better-auth/client/plugins";
import { twoFactorClient } from "better-auth/client/plugins";
import { apiKeyClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // the base url of your auth server
	plugins: [
		organizationClient(),
		twoFactorClient(),
		apiKeyClient(),
		adminClient(),
	],
});
