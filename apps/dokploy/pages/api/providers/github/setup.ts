import { db } from "@/server/db";
import { github } from "@/server/db/schema";
import {
	createGithub,
	findAdminByAuthId,
	findAuthById,
	findUserByAuthId,
} from "@dokploy/server";
import { eq } from "drizzle-orm";
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
	const { code, state, installation_id, setup_action }: Query =
		req.query as Query;

	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}
	const [action, value] = state?.split(":");
	// Value could be the authId or the githubProviderId

	if (action === "gh_init") {
		const octokit = new Octokit({});
		const { data } = await octokit.request(
			"POST /app-manifests/{code}/conversions",
			{
				code: code as string,
			},
		);

		const auth = await findAuthById(value as string);

		let adminId = "";
		if (auth.rol === "admin") {
			const admin = await findAdminByAuthId(auth.id);
			adminId = admin.adminId;
		} else {
			const user = await findUserByAuthId(auth.id);
			adminId = user.adminId;
		}

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
			adminId,
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
