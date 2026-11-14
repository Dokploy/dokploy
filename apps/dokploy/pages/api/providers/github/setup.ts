import {
	authGithub,
	createGithub,
	deriveGithubApiUrl,
	getGithubToken,
	parseGithubBaseUrl,
	validateRequest,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { hasPermission } from "@dokploy/server/services/permission";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";
import { github } from "@/server/db/schema";

type Query = {
	code: string;
	state: string;
	installation_id: string;
	setup_action: string;
	githubUrl?: string;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state, installation_id, githubUrl }: Query = req.query as Query;

	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}

	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	const ctx = {
		user: { id: user.id },
		session: { activeOrganizationId: session.activeOrganizationId },
	};

	const [action] = state?.split(":") ?? [];
	if (!(await hasPermission(ctx, { gitProviders: ["create"] }))) {
		return res.status(403).json({ error: "Forbidden" });
	}

	if (action === "gh_init") {
		// Reject before any outbound request: this runs on a GET the user can be
		// linked into, so the host is not trusted.
		const parsed = parseGithubBaseUrl(githubUrl);
		if ("error" in parsed) {
			return res.status(400).json({ error: parsed.error });
		}

		const baseUrl = parsed.url;
		const octokit = new Octokit({ baseUrl: deriveGithubApiUrl(baseUrl) });
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
				githubUrl: baseUrl,
			},
			session.activeOrganizationId,
			user.id,
		);
	} else if (action === "gh_setup") {
		const githubId = state?.split(":")[1];
		if (!githubId || !installation_id || Array.isArray(installation_id)) {
			return res
				.status(400)
				.json({ error: "Missing github provider or installation id" });
		}

		const provider = await db.query.github.findFirst({
			where: eq(github.githubId, githubId),
			with: { gitProvider: true },
		});
		if (
			!provider ||
			provider.gitProvider.organizationId !== session.activeOrganizationId
		) {
			return res.status(404).json({ error: "Github provider not found" });
		}

		// installation_id arrives in the query string; only bind an installation
		// this provider's GitHub App can actually authenticate as, otherwise one
		// tenant can claim another's installation and break its webhooks.
		try {
			await getGithubToken(
				authGithub({ ...provider, githubInstallationId: installation_id }),
			);
		} catch {
			return res.status(400).json({ error: "Invalid github installation" });
		}

		await db
			.update(github)
			.set({
				githubInstallationId: installation_id,
			})
			.where(eq(github.githubId, githubId))
			.returning();
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
