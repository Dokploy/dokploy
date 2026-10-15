import { basename } from "node:path";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	assertTransferPermission,
	BUNDLE_EXTENSION,
	EXPORTS_DIRECTORY,
	findOrganizationDestination,
	listBundles,
	safeErrorMessage,
	streamBundleFromDestination,
	streamProcessToResponse,
} from "@dokploy/server/services/project-export-import";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
	api: {
		responseLimit: false,
	},
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		res.status(405).json({ message: "Method not allowed" });
		return;
	}

	const { session, user } = await validateRequest(req);
	const organizationId = (session as { activeOrganizationId?: string } | null)
		?.activeOrganizationId;
	if (!session || !user || !organizationId) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	const { destinationId, key } = req.query;
	if (
		typeof destinationId !== "string" ||
		typeof key !== "string" ||
		!key.startsWith(`${EXPORTS_DIRECTORY}/`) ||
		!key.endsWith(BUNDLE_EXTENSION) ||
		key.includes("..")
	) {
		res.status(400).json({ message: "Invalid bundle" });
		return;
	}

	try {
		await assertTransferPermission(
			{
				user: { id: user.id },
				session: { activeOrganizationId: organizationId },
			},
			undefined,
			"export",
		);
	} catch {
		res.status(403).json({ message: "Forbidden" });
		return;
	}

	let destination: Awaited<ReturnType<typeof findOrganizationDestination>>;
	try {
		destination = await findOrganizationDestination(
			destinationId,
			organizationId,
		);
	} catch {
		res.status(404).json({ message: "Destination not found" });
		return;
	}

	let bundle: Awaited<ReturnType<typeof listBundles>>[number] | undefined;
	try {
		bundle = (await listBundles(destination)).find(
			(entry) => entry.key === key,
		);
	} catch (error) {
		res.status(502).json({ message: safeErrorMessage(error) });
		return;
	}
	if (!bundle) {
		res.status(404).json({ message: "Bundle not found" });
		return;
	}

	res.setHeader("Content-Type", "application/gzip");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename*=UTF-8''${encodeURIComponent(basename(key))}`,
	);
	res.setHeader("Content-Length", bundle.size);

	const proc = await streamBundleFromDestination(destination, key);
	await streamProcessToResponse(proc, res).catch(() => {});
}
