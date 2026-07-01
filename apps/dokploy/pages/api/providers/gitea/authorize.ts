import { validateRequest } from "@dokploy/server/lib/auth";
import {
	canManageGitProviderOAuth,
	signGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import type { NextApiRequest, NextApiResponse } from "next";
import { findGitea, redirectWithError } from "./helper";

export const GITEA_OAUTH_SCOPE = "read:user read:repository read:organization";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	try {
		if (req.method !== "GET") {
			return res.status(405).json({ error: "Method not allowed" });
		}

		const { giteaId } = req.query;

		if (!giteaId || Array.isArray(giteaId)) {
			return res.status(400).json({ error: "Invalid Gitea provider ID" });
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

		const gitea = await findGitea(giteaId as string);
		if (!gitea || !canManageGitProviderOAuth(gitea, session, user)) {
			return redirectWithError(res, "Forbidden");
		}
		if (!gitea?.clientId || !gitea.redirectUri) {
			return redirectWithError(res, "Incomplete OAuth configuration");
		}

		// Generate the Gitea authorization URL
		const authorizationUrl = new URL(`${gitea.giteaUrl}/login/oauth/authorize`);
		authorizationUrl.searchParams.append("client_id", gitea.clientId as string);
		authorizationUrl.searchParams.append("response_type", "code");
		authorizationUrl.searchParams.append(
			"redirect_uri",
			gitea.redirectUri as string,
		);
		authorizationUrl.searchParams.append("scope", GITEA_OAUTH_SCOPE);
		authorizationUrl.searchParams.append(
			"state",
			signGitProviderOAuthState({
				providerType: "gitea",
				providerId: giteaId as string,
				redirectUri: gitea.redirectUri as string,
				sessionId: session.id,
				userId: session.userId,
				organizationId: session.activeOrganizationId,
			}),
		);

		// Redirect user to Gitea authorization URL
		return res.redirect(307, authorizationUrl.toString());
	} catch (error) {
		console.error("Error initiating Gitea OAuth flow:", error);
		return res.status(500).json({ error: "Internal server error" });
	}
}
