import { findGitlabById, updateGitlab } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	canManageGitProviderOAuth,
	verifyGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import { assertGitProviderBaseUrlAllowed } from "@dokploy/server/utils/providers/url";
import { fetchWithPublicEgress } from "@dokploy/server/utils/url/network";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, gitlabId, state } = req.query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}
	if (!gitlabId || Array.isArray(gitlabId) || !state || Array.isArray(state)) {
		return res.status(400).json({ error: "Missing or invalid OAuth state" });
	}

	const { session, user } = await validateRequest(req);
	if (
		!session?.id ||
		!session.userId ||
		!session.activeOrganizationId ||
		!user
	) {
		return res.status(401).json({ error: "Authentication required" });
	}

	let statePayload: { providerId: string; redirectUri: string };
	try {
		statePayload = verifyGitProviderOAuthState(state, {
			providerType: "gitlab",
			providerId: gitlabId,
			sessionId: session.id,
			userId: session.userId,
			organizationId: session.activeOrganizationId,
		});
	} catch {
		return res.status(400).json({ error: "Invalid OAuth state" });
	}

	const gitlab = await findGitlabById(gitlabId);
	if (!canManageGitProviderOAuth(gitlab, session, user)) {
		return res.status(403).json({ error: "Forbidden" });
	}
	const redirectUri = `${gitlab.redirectUri}?gitlabId=${gitlabId}`;
	if (statePayload.redirectUri !== redirectUri) {
		return res.status(400).json({ error: "Invalid OAuth state" });
	}
	// Use internal URL for token exchange when GitLab is on same instance as Dokploy
	const baseUrl = gitlab.gitlabInternalUrl || gitlab.gitlabUrl;
	let gitlabUrl: URL;
	try {
		gitlabUrl = new URL(baseUrl);
	} catch {
		return res.status(400).json({ error: "Invalid GitLab provider URL" });
	}

	const headers: HeadersInit = {
		"Content-Type": "application/x-www-form-urlencoded",
	};

	// In case of basic auth being present in the URL, we need to remove it from the URL
	// and add it to the Authorization header.
	if (gitlabUrl.username || gitlabUrl.password) {
		if (!gitlabUrl.username || !gitlabUrl.password) {
			return res.status(400).json({ error: "Invalid GitLab provider URL" });
		}
		headers.Authorization = `Basic ${Buffer.from(`${gitlabUrl.username}:${gitlabUrl.password}`).toString("base64")}`;
	}

	const sanitizedGitlabUrl = new URL(gitlabUrl.toString());
	sanitizedGitlabUrl.username = "";
	sanitizedGitlabUrl.password = "";

	let url: string;
	try {
		url = await assertGitProviderBaseUrlAllowed(sanitizedGitlabUrl.toString(), {
			fieldName: "GitLab provider URL",
		});
	} catch {
		return res.status(400).json({ error: "Invalid GitLab provider URL" });
	}

	const response = await fetchWithPublicEgress(
		new URL("oauth/token", `${url}/`),
		{
			method: "POST",
			headers,
			body: new URLSearchParams({
				client_id: gitlab.applicationId as string,
				client_secret: gitlab.secret as string,
				code: code as string,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
			}),
		},
		{ fieldName: "GitLab provider URL" },
	);

	const result = await response.json();

	if (!result.access_token || !result.refresh_token) {
		return res.status(400).json({ error: "Missing or invalid code" });
	}

	const expiresAt = Math.floor(Date.now() / 1000) + result.expires_in;
	await updateGitlab(gitlab.gitlabId, {
		accessToken: result.access_token,
		refreshToken: result.refresh_token,
		expiresAt,
	});

	return res.redirect(307, "/dashboard/settings/git-providers");
}
