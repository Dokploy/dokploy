import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method === "POST") {
		const xGitHubEvent = req.headers["x-github-event"];

		if (xGitHubEvent === "ping") {
			res.redirect(307, "/dashboard/settings");
		} else {
			res.redirect(307, "/dashboard/settings");
		}
	} else {
		res.setHeader("Allow", ["POST"]);
		return res.status(405).end(`Method ${req.method} not allowed`);
	}
}
