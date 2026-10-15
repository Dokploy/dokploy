import { basename } from "node:path";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	assertTransferPermission,
	escapeShellArg,
	fileSize,
	invalidateDownloadToken,
	peekDownloadToken,
	streamProcessToResponse,
} from "@dokploy/server/services/project-export-import";
import { openProcessStream } from "@dokploy/server/utils/process/remoteStream";
import { TRPCError } from "@trpc/server";
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
	if (!session || !user) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	const { token } = req.query;
	if (typeof token !== "string") {
		res.status(400).json({ message: "Invalid token" });
		return;
	}

	const job = peekDownloadToken(token);
	const activeOrganizationId = (session as { activeOrganizationId?: string })
		.activeOrganizationId;
	if (
		!job ||
		job.organizationId !== activeOrganizationId ||
		!activeOrganizationId
	) {
		res.status(404).json({ message: "Not found" });
		return;
	}

	try {
		await assertTransferPermission(
			{ user: { id: user.id }, session: { activeOrganizationId } },
			undefined,
			"export",
		);
	} catch (error) {
		const status =
			error instanceof TRPCError && error.code === "FORBIDDEN" ? 403 : 401;
		res.status(status).json({ message: "Unauthorized" });
		return;
	}

	if (job.status !== "done" || !job.bundle) {
		res.status(409).json({ message: "Export is not ready for download" });
		return;
	}

	const bundle = job.bundle;
	let size = 0;
	try {
		size = await fileSize(bundle);
	} catch {}
	if (size === 0) {
		res.status(404).json({ message: "Bundle file is missing" });
		return;
	}

	res.setHeader("Content-Type", "application/gzip");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="${basename(bundle.path)}"`,
	);
	res.setHeader("Content-Length", size);

	const proc = await openProcessStream(
		bundle.serverId,
		`cat ${escapeShellArg(bundle.path)}`,
	);
	await streamProcessToResponse(proc, res)
		.then(() => invalidateDownloadToken(token))
		.catch(() => {});
}
