import { validateRequest } from "@dokploy/server";
import { redactRcloneCredentials } from "@dokploy/server/utils/backups/redact";
import { getS3Credentials } from "@dokploy/server/utils/backups/utils";
import { execStreamLocal } from "@dokploy/server/utils/process/execAsync";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { NextApiRequest, NextApiResponse } from "next";
import { quote } from "shell-quote";
import { audit } from "@/server/api/utils/audit";
import {
	listRcloneFiles,
	resolveBackupAccess,
} from "@/server/api/utils/backup-files";

// externalResolver: the handler returns while the stream is still writing.
export const config = {
	api: { responseLimit: false, externalResolver: true },
};

const FILE_NAME_REGEX = /^[A-Za-z0-9._-]+$/;

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "GET") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const { backupId, file } = req.query as { backupId?: string; file?: string };
	if (
		!backupId ||
		!file ||
		file.startsWith(".") ||
		!FILE_NAME_REGEX.test(file)
	) {
		return res.status(400).json({ error: "Invalid request" });
	}

	const { user, session } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	const ctx = {
		user: { id: user.id, email: user.email, role: user.role },
		session: { activeOrganizationId: session.activeOrganizationId },
	};

	try {
		const { destination, folder } = await resolveBackupAccess(ctx, backupId);

		// Listing the exact key avoids paging a folder that can hold thousands of backups.
		const [backupFile] = await listRcloneFiles(destination, `${folder}${file}`);
		if (backupFile?.Name !== file) {
			return res.status(404).json({ error: "Backup file not found" });
		}

		await audit(ctx, {
			action: "download",
			resourceType: "backup",
			resourceId: backupId,
			metadata: { file },
		});

		const path = `:s3:${destination.bucket}/${folder}${file}`;
		const command = `rclone cat ${getS3Credentials(destination).join(" ")} ${quote([path])}`;
		if (res.destroyed) return;

		const stream = execStreamLocal(command);
		res.on("close", () => stream.destroy());

		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
		res.setHeader("Content-Length", String(backupFile.Size));

		stream.on("error", (error) => {
			console.error(redactRcloneCredentials(String(error)));
			res.destroy();
		});
		stream.pipe(res);
	} catch (error) {
		console.error(redactRcloneCredentials(String(error)));
		if (res.headersSent) {
			return res.destroy();
		}
		const status =
			error instanceof TRPCError ? getHTTPStatusCodeFromError(error) : 500;
		return res
			.status(status)
			.json({ error: "Error downloading the backup file" });
	}
}
