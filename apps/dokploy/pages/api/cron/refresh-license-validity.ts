import type { NextApiRequest, NextApiResponse } from "next";
import { refreshAllLicenseValidity } from "@/server/utils/enterprise";

/**
 * Cron endpoint to refresh isValidEnterpriseLicense for all users with a license key.
 * Call every 2 weeks (e.g. 0 0 1,15 * * for 1st and 15th, or via your hosting cron).
 *
 * Requires CRON_SECRET in Authorization header or query: ?secret=CRON_SECRET
 */
export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET" && req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const secret =
		process.env.CRON_SECRET ?? process.env.LICENSE_CRON_SECRET;
	if (!secret) {
		return res.status(500).json({
			error: "CRON_SECRET or LICENSE_CRON_SECRET not configured",
		});
	}

	const authHeader = req.headers.authorization;
	const bearer = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: undefined;
	const querySecret = typeof req.query.secret === "string" ? req.query.secret : undefined;

	if (bearer !== secret && querySecret !== secret) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const result = await refreshAllLicenseValidity();
		return res.status(200).json(result);
	} catch (err) {
		console.error("refresh-license-validity:", err);
		return res
			.status(500)
			.json({
				error: err instanceof Error ? err.message : "Refresh failed",
			});
	}
}
