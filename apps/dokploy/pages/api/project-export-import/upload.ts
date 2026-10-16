import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { validateRequest } from "@dokploy/server/lib/auth";
import {
	assertNoActiveTransfer,
	assertTransferPermission,
	at,
	createImportJobIfNoneActive,
	escapeShellArg,
	findOrganizationServerId,
	type Location,
	prepareRoot,
	remove,
	TRANSFER_MAX_UPLOAD_BYTES,
	transferRoot,
	updateImportJob,
} from "@dokploy/server/services/project-export-import";
import { openProcessStream } from "@dokploy/server/utils/process/remoteStream";
import { TRPCError } from "@trpc/server";
import busboy from "busboy";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
	api: {
		bodyParser: false,
	},
};

class UploadTooLargeError extends Error {}

type UploadTarget = { stream: Writable; done: Promise<void> };

const openTarget = async (bundle: Location): Promise<UploadTarget> => {
	if (!bundle.serverId) {
		const stream = createWriteStream(bundle.path);
		return {
			stream,
			done: new Promise((resolve, reject) => {
				stream.on("finish", resolve);
				stream.on("error", reject);
			}),
		};
	}
	const proc = await openProcessStream(
		bundle.serverId,
		`mkdir -p ${escapeShellArg(join(bundle.path, ".."))} && cat > ${escapeShellArg(bundle.path)}`,
	);
	proc.stdout.resume();
	proc.stdin.on("error", () => {});
	const errors: string[] = [];
	proc.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
	return {
		stream: proc.stdin as Writable,
		done: proc.exit.then((code) => {
			if (code !== 0) {
				throw new Error(
					`Writing the bundle on the server failed: ${errors.join("").trim()}`,
				);
			}
		}),
	};
};

const receiveUpload = (
	req: NextApiRequest,
	target: UploadTarget,
	maxBytes: number,
): Promise<void> =>
	new Promise((resolve, reject) => {
		const bb = busboy({ headers: req.headers, limits: { fileSize: maxBytes } });
		let gotFile = false;

		const abort = (error: Error) => {
			target.stream.destroy();
			bb.destroy();
			req.unpipe(bb);
			req.destroy();
			reject(error);
		};

		target.done.catch(abort);

		bb.on("file", (_name, file) => {
			if (gotFile) {
				file.on("error", () => {});
				file.resume();
				abort(new Error("Upload contains more than one file field"));
				return;
			}
			gotFile = true;
			let limited = false;

			file.on("error", () => {});
			file.on("limit", () => {
				limited = true;
				abort(
					new UploadTooLargeError("Bundle exceeds the maximum upload size"),
				);
			});

			target.done.then(
				() => {
					if (!limited) resolve();
				},
				(error) => reject(error),
			);
			file.pipe(target.stream);
		});

		bb.on("error", reject);
		bb.on("close", () => {
			if (!gotFile) {
				reject(new Error("No file field found in the upload"));
			}
		});

		req.pipe(bb);
	});

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		res.status(405).json({ message: "Method not allowed" });
		return;
	}

	const { session, user } = await validateRequest(req);
	const activeOrganizationId = (
		session as { activeOrganizationId?: string } | null
	)?.activeOrganizationId;
	if (!session || !user || !activeOrganizationId) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	try {
		await assertTransferPermission(
			{ user: { id: user.id }, session: { activeOrganizationId } },
			undefined,
			"import",
		);
	} catch (error) {
		res.status(403).json({
			message: error instanceof Error ? error.message : "Forbidden",
		});
		return;
	}

	try {
		assertNoActiveTransfer(user.id);
	} catch (error) {
		if (error instanceof TRPCError && error.code === "CONFLICT") {
			res.status(409).json({ message: error.message });
			return;
		}
		throw error;
	}

	let serverId: string | null;
	try {
		const requested = req.query?.serverId;
		serverId = await findOrganizationServerId(
			typeof requested === "string" ? requested : undefined,
			activeOrganizationId,
		);
	} catch (error) {
		res.status(400).json({
			message: error instanceof Error ? error.message : "Invalid server",
		});
		return;
	}

	const importId = randomUUID();
	const root = transferRoot(importId, serverId);
	const bundle = at(root, "bundle.dokploy.tar.gz");

	let target: UploadTarget | undefined;
	try {
		await prepareRoot(root);
		target = await openTarget(bundle);
		await receiveUpload(req, target, TRANSFER_MAX_UPLOAD_BYTES);
	} catch (error) {
		target?.stream.destroy();
		await remove(root).catch(() => {});
		const tooLarge = error instanceof UploadTooLargeError;
		res.status(tooLarge ? 413 : 400).json({
			message: error instanceof Error ? error.message : "Upload failed",
		});
		return;
	}

	try {
		createImportJobIfNoneActive(importId, user.id, activeOrganizationId);
	} catch (error) {
		await remove(root).catch(() => {});
		if (error instanceof TRPCError && error.code === "CONFLICT") {
			res.status(409).json({ message: error.message });
			return;
		}
		throw error;
	}
	updateImportJob(importId, { root, bundle, status: "uploaded" });

	res.status(200).json({ importId, serverId });
}
