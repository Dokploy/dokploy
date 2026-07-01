import { updateGitea } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	canManageGitProviderOAuth,
	verifyGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import { assertGitProviderBaseUrlAllowed } from "@dokploy/server/utils/providers/url";
import {
	redactSecretFields,
	redactSensitiveText,
} from "@dokploy/server/utils/security/redaction";
import { fetchWithPublicEgress } from "@dokploy/server/utils/url/network";
import type { NextApiRequest, NextApiResponse } from "next";
import { findGitea, type Gitea, redirectWithError } from "./helper";

// Helper to fetch access token from Gitea
const fetchAccessToken = async (gitea: Gitea, code: string) => {
	// Use internal URL for token exchange when Gitea is on same instance as Dokploy
	const baseUrl = await assertGitProviderBaseUrlAllowed(
		gitea.giteaInternalUrl || gitea.giteaUrl,
		{ fieldName: "Gitea provider URL" },
	);
	const response = await fetchWithPublicEgress(
		new URL("login/oauth/access_token", `${baseUrl}/`),
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: new URLSearchParams({
				client_id: gitea.clientId as string,
				client_secret: gitea.clientSecret as string,
				code,
				grant_type: "authorization_code",
				redirect_uri: gitea.redirectUri || "",
			}),
		},
		{ fieldName: "Gitea provider URL" },
	);

	const responseText = await response.text();
	return response.ok
		? JSON.parse(responseText)
		: {
				error: "Token exchange failed",
				responseText: redactSensitiveText(responseText),
			};
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state } = req.query;

	if (!code || Array.isArray(code) || !state || Array.isArray(state)) {
		return redirectWithError(
			res,
			"Invalid authorization code or state parameter",
		);
	}

	const { session, user } = await validateRequest(req);
	if (
		!session?.id ||
		!session.userId ||
		!session.activeOrganizationId ||
		!user
	) {
		return redirectWithError(res, "Authentication required");
	}

	let statePayload: { providerId: string; redirectUri: string };
	try {
		statePayload = verifyGitProviderOAuthState(state as string, {
			providerType: "gitea",
			sessionId: session.id,
			userId: session.userId,
			organizationId: session.activeOrganizationId,
		});
	} catch {
		return redirectWithError(res, "Invalid OAuth state");
	}

	const gitea = await findGitea(statePayload.providerId);
	if (!gitea) return redirectWithError(res, "Failed to find Gitea provider");
	if (!canManageGitProviderOAuth(gitea, session, user)) {
		return redirectWithError(res, "Forbidden");
	}
	if (statePayload.redirectUri !== gitea.redirectUri) {
		return redirectWithError(res, "Invalid OAuth state");
	}

	// Fetch the access token from Gitea
	let result: {
		error?: string;
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		organizationName?: string;
	};
	try {
		result = await fetchAccessToken(gitea, code as string);
	} catch (error) {
		return redirectWithError(
			res,
			error instanceof Error ? error.message : "Token exchange failed",
		);
	}

	if (result.error) {
		console.error(
			"Token exchange failed:",
			redactSecretFields(result, ["access_token", "refresh_token"]),
		);
		return redirectWithError(res, result.error);
	}

	if (!result.access_token) {
		console.error(
			"Missing access token:",
			redactSecretFields(result, ["access_token", "refresh_token"]),
		);
		return redirectWithError(res, "No access token received");
	}

	const expiresAt = result.expires_in
		? Math.floor(Date.now() / 1000) + result.expires_in
		: null;

	try {
		await updateGitea(gitea.giteaId, {
			accessToken: result.access_token,
			refreshToken: result.refresh_token,
			expiresAt,
			...(result.organizationName
				? { organizationName: result.organizationName }
				: {}),
		});

		return res.redirect(
			307,
			"/dashboard/settings/git-providers?connected=true",
		);
	} catch (updateError) {
		console.error("Failed to update Gitea provider:", updateError);
		return redirectWithError(res, "Failed to store access token");
	}
}
