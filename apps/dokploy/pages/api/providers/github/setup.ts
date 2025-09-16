import { eq } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/server/db";
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
	const { state, installation_id }: Query = req.query as Query;

	if (!installation_id) {
		return res.status(400).json({ error: "Missing installation_id parameter" });
	}

	// State should contain "gh_setup:githubId"
	const [action, githubId] = state?.split(":") || [];

	if (action === "gh_setup" && githubId) {
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
