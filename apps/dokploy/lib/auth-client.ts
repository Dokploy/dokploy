import { apiKeyClient } from "@better-auth/api-key/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import {
	adminClient,
	inferAdditionalFields,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import posthog from "posthog-js";

export const authClient = createAuthClient({
	// baseURL: "http://localhost:3000", // the base url of your auth server
	fetchOptions: {
		// better-auth's fetch client bypasses posthog-js tracing headers; forward the session so signup links to its replay.
		onRequest: (context) => {
			if (posthog.__loaded) {
				context.headers.set("x-posthog-session-id", posthog.get_session_id());
			}
			return context;
		},
	},
	plugins: [
		organizationClient(),
		twoFactorClient(),
		passkeyClient(),
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
