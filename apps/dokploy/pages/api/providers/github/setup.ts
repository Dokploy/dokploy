import { createGithub, validateRequest } from "@dokploy/server";
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
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const { code, state, installation_id }: Query = req.query as Query;

	if (!code) {
		return res.status(400).json({ error: "Missing code parameter" });
	}

	// This callback performs privileged writes (persisting App secrets, re-pointing
	// installations) but sits outside tRPC, so it must authenticate and authorize
	// on its own. The write target is derived from the session, never from `state`.
	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	const ctx = {
		user: { id: user.id },
		session: { activeOrganizationId: session.activeOrganizationId },
	};

	const [action] = state?.split(":") ?? [];
	// gh_init creates a provider, gh_setup re-points an existing one; both require
	// the gitProviders permission (the same guard the tRPC github router uses).
	if (!(await hasPermission(ctx, { gitProviders: ["create"] }))) {
		return res.status(403).json({ error: "Forbidden" });
	}

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
			session.activeOrganizationId,
			user.id,
		);
	} else if (action === "gh_setup") {
		const githubId = state?.split(":")[1];
		if (!githubId) {
			return res.status(400).json({ error: "Missing github provider id" });
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
