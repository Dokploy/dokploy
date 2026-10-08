import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { getAccessibleRestoration } from "@/server/api/routers/restoration";
import { restorationLogPath } from "@/server/utils/restoration-history";

export default async function downloadRestorationLog(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		return res.status(405).end();
	}
	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) return res.status(401).end();
	const id = req.query.restorationId;
	if (typeof id !== "string" || !/^[\w-]+$/.test(id))
		return res.status(400).end();
	try {
		await getAccessibleRestoration(
			{ user, session: { activeOrganizationId: session.activeOrganizationId } },
			id,
		);
		const file = restorationLogPath(id);
		await stat(file);
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="restoration-${id}.log"`,
		);
		res.setHeader("Cache-Control", "private, no-store");
		const stream = createReadStream(file);
		stream.on("error", () => res.destroy());
		stream.pipe(res);
	} catch {
		res.status(404).end();
	}
}
