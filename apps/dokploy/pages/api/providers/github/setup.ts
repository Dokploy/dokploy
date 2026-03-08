import { createGithub } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";
import { github } from "@/server/db/schema";

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

	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}
	const [action, ...rest] = state?.split(":");
	// For gh_init: rest[0] = organizationId, rest[1] = userId
	// For gh_setup: rest[0] = githubProviderId

	if (action === "gh_init") {
		const organizationId = rest[0];
		const userId = rest[1] || (req.query.userId as string);

		if (!userId) {
			return res.status(400).json({ error: "Missing userId parameter" });
		}

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
			organizationId as string,
			userId,
		);
	} else if (action === "gh_setup") {
		await db
			.update(github)
			.set({
				githubInstallationId: installation_id,
			})
			.where(eq(github.githubId, rest[0] as string))
			.returning();
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
