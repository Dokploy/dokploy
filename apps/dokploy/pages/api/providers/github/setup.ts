import { createGithub, findGithubById, updateGithub } from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	canManageGitProviderOAuth,
	GITHUB_APP_INIT_STATE_PROVIDER_ID,
	getGithubIdFromAppSetupStateProviderId,
	verifyGitProviderOAuthState,
} from "@dokploy/server/utils/providers/oauth-state";
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";

type Query = {
	code: string;
	state: string;
	installation_id: string;
	setup_action: string;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state, installation_id }: Query = req.query as Query;

	if (!code || Array.isArray(code)) {
		return res.status(400).json({ error: "Missing code parameter" });
	}
	if (!state || Array.isArray(state)) {
		return res.status(400).json({ error: "Missing or invalid state" });
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

	let statePayload: {
		providerId: string;
		organizationId: string;
		userId: string;
	};
	try {
		statePayload = verifyGitProviderOAuthState(state, {
			providerType: "github-app",
			sessionId: session.id,
			userId: session.userId,
			organizationId: session.activeOrganizationId,
		});
	} catch {
		return res.status(400).json({ error: "Invalid state" });
	}

	if (statePayload.providerId === GITHUB_APP_INIT_STATE_PROVIDER_ID) {
		const octokit = new Octokit({});
		const { data } = await octokit.request(
			"POST /app-manifests/{code}/conversions",
			{
				code: code as string,
			},
		);

		await createGithub(
			{
				name: data.name,
				githubAppName: data.html_url,
				githubAppId: data.id,
				githubClientId: data.client_id,
				githubClientSecret: data.client_secret,
				githubWebhookSecret: data.webhook_secret,
				githubPrivateKey: data.pem,
			},
			statePayload.organizationId,
			statePayload.userId,
		);
	} else {
		if (!installation_id || Array.isArray(installation_id)) {
			return res.status(400).json({ error: "Missing installation_id" });
		}

		const githubId = getGithubIdFromAppSetupStateProviderId(
			statePayload.providerId,
		);
		if (!githubId) {
			return res.status(400).json({ error: "Invalid state" });
		}

		const githubProvider = await findGithubById(githubId);
		if (!canManageGitProviderOAuth(githubProvider, session, user)) {
			return res.status(403).json({ error: "Forbidden" });
		}

		await updateGithub(githubId, {
			githubInstallationId: installation_id,
		});
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
