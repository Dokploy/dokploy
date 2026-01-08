import { createGithub } from "@dokploy/server";
import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";
import { db } from "@/server/db";
import { github } from "@/server/db/schema";

type Query = {
	code: string;
	state: string;
	installation_id: string;
	setup_action: string;
	userId: string;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state, installation_id, userId }: Query = req.query as Query;

	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}
	const [action, value] = state?.split(":");
	// Value could be the organizationId or the githubProviderId

	if (action === "gh_init") {
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
			value as string,
			userId,
		);
	} else if (action === "gh_setup") {
		await db
			.update(github)
			.set({
				githubInstallationId: installation_id,
			})
			.where(eq(github.githubId, value as string))
			.returning();
	}

	res.redirect(307, "/dashboard/settings/git-providers");
}
