import type { NextApiRequest, NextApiResponse } from "next";
import { findGitea, redirectWithError } from "./helper";

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

		const gitea = await findGitea(giteaId as string);
		if (!gitea || !gitea.clientId || !gitea.redirectUri) {
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
		authorizationUrl.searchParams.append("scope", "read:user repo");
		authorizationUrl.searchParams.append("state", giteaId as string);

		// Redirect user to Gitea authorization URL
		return res.redirect(307, authorizationUrl.toString());
	} catch (error) {
		console.error("Error initiating Gitea OAuth flow:", error);
		return res.status(500).json({ error: "Internal server error" });
	}
}
