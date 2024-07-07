import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "octokit";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { admins } from "@/server/db/schema";

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
	const { code, state, installation_id, setup_action }: Query =
		req.query as Query;
	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}
	const [action, authId] = state?.split(":");

	if (action === "gh_init") {
		const octokit = new Octokit({});
		const { data } = await octokit.request(
			"POST /app-manifests/{code}/conversions",
			{
				code: code as string,
			},
		);

		const result = await db
			.update(admins)
			.set({
				githubAppId: data.id,
				githubAppName: data.name,
				githubClientId: data.client_id,
				githubClientSecret: data.client_secret,
				githubWebhookSecret: data.webhook_secret,
				githubPrivateKey: data.pem,
			})
			.where(eq(admins.authId, authId as string))
			.returning();
	} else if (action === "gh_setup") {
		await db
			.update(admins)
			.set({
				githubInstallationId: installation_id,
			})
			.where(eq(admins.authId, authId as string))
			.returning();
	}

	res.redirect(307, "/dashboard/settings/server");
}
