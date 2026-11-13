import {
	canViewGitProviderSecrets,
	updateGitea,
	validateRequest,
} from "@dokploy/server";
import type { NextApiRequest, NextApiResponse } from "next";
import { findGitea, type Gitea, redirectWithError } from "./helper";

// Helper to fetch access token from Gitea
const fetchAccessToken = async (gitea: Gitea, code: string) => {
	// Use internal URL for token exchange when Gitea is on same instance as Dokploy
	const baseUrl = gitea.giteaInternalUrl || gitea.giteaUrl;
	const response = await fetch(`${baseUrl}/login/oauth/access_token`, {
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
	});

	const responseText = await response.text();
	return response.ok
		? JSON.parse(responseText)
		: { error: "Token exchange failed", responseText };
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

	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		return redirectWithError(res, "Unauthorized");
	}

	const giteaId = state.split(":")[0];
	if (!giteaId || state !== req.cookies.gitea_oauth_state) {
		return redirectWithError(res, "Invalid state");
	}

	const gitea = await findGitea(giteaId);
	if (!gitea) return redirectWithError(res, "Failed to find Gitea provider");

	if (gitea.gitProvider.organizationId !== session.activeOrganizationId) {
		return redirectWithError(res, "Failed to find Gitea provider");
	}
	if (
		!(await canViewGitProviderSecrets(
			{
				userId: user.id,
				activeOrganizationId: session.activeOrganizationId,
			},
			gitea.gitProvider,
		))
	) {
		return redirectWithError(res, "Unauthorized");
	}

	// Fetch the access token from Gitea
	const result = await fetchAccessToken(gitea, code as string);

	if (result.error) {
		console.error("Token exchange failed:", result);
		return redirectWithError(res, result.error);
	}

	if (!result.access_token) {
		console.error("Missing access token:", result);
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
