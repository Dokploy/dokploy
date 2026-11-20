import { randomBytes } from "node:crypto";
import {
	canViewGitProviderSecrets,
	findGitlabById,
	validateRequest,
} from "@dokploy/server";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { gitlabId } = req.query;
	if (!gitlabId || Array.isArray(gitlabId)) {
		return res.status(400).json({ error: "Invalid GitLab provider ID" });
	}

	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const gitlab = await findGitlabById(gitlabId);
	if (gitlab.gitProvider.organizationId !== session.activeOrganizationId) {
		return res.status(404).json({ error: "Gitlab provider not found" });
	}
	if (
		!(await canViewGitProviderSecrets(
			{
				userId: user.id,
				activeOrganizationId: session.activeOrganizationId,
			},
			gitlab.gitProvider,
		))
	) {
		return res.status(403).json({ error: "Forbidden" });
	}

	const state = `${gitlabId}:${randomBytes(16).toString("hex")}`;
	res.setHeader(
		"Set-Cookie",
		`gitlab_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
	);

	const authorizationUrl = new URL(`${gitlab.gitlabUrl}/oauth/authorize`);
	authorizationUrl.searchParams.append("client_id", gitlab.applicationId || "");
	authorizationUrl.searchParams.append(
		"redirect_uri",
		`${gitlab.redirectUri}?gitlabId=${gitlabId}`,
	);
	authorizationUrl.searchParams.append("response_type", "code");
	authorizationUrl.searchParams.append(
		"scopes",
		"api read_user read_repository",
	);
	authorizationUrl.searchParams.append("state", state);

	return res.redirect(307, authorizationUrl.toString());
}
