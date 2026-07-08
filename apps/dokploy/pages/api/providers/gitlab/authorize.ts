import { findGitlabById } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	canManageGitProviderOAuth,
	signGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const { gitlabId } = req.query;
	if (!gitlabId || Array.isArray(gitlabId)) {
		return res.status(400).json({ error: "Invalid GitLab provider ID" });
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

	const gitlab = await findGitlabById(gitlabId);
	if (!canManageGitProviderOAuth(gitlab, session, user)) {
		return res.status(403).json({ error: "Forbidden" });
	}
	if (!gitlab.applicationId || !gitlab.redirectUri || !gitlab.gitlabUrl) {
		return res.status(400).json({ error: "Incomplete OAuth configuration" });
	}

	const redirectUri = `${gitlab.redirectUri}?gitlabId=${gitlabId}`;
	const authorizationUrl = new URL(`${gitlab.gitlabUrl}/oauth/authorize`);
	authorizationUrl.searchParams.append("client_id", gitlab.applicationId);
	authorizationUrl.searchParams.append("redirect_uri", redirectUri);
	authorizationUrl.searchParams.append("response_type", "code");
	authorizationUrl.searchParams.append(
		"scope",
		"api read_user read_repository",
	);
	authorizationUrl.searchParams.append(
		"state",
		signGitProviderOAuthState({
			providerType: "gitlab",
			providerId: gitlabId,
			redirectUri,
			sessionId: session.id,
			userId: session.userId,
			organizationId: session.activeOrganizationId,
		}),
	);

	return res.redirect(307, authorizationUrl.toString());
}
