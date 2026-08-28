import {
	ContainerFilesystemError,
	MAX_FILE_UPLOAD_BYTES,
	uploadFileToContainerDirectory,
} from "@dokploy/server";
import { validateRequest } from "@dokploy/server/lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";
import {
	FILESYSTEM_SERVICE_TYPES,
	type FilesystemServiceType,
	getAuthorizedServiceFilesystemContainer,
} from "@/server/api/utils/service-filesystem";

export const config = {
	api: {
		bodyParser: false,
	},
};

const getSingleQueryValue = (value: string | string[] | undefined) =>
	typeof value === "string" && value.length > 0 ? value : undefined;

const isFilesystemServiceType = (
	value: string | undefined,
): value is FilesystemServiceType =>
	!!value &&
	(FILESYSTEM_SERVICE_TYPES as readonly string[]).includes(value);

const errorStatus = (error: unknown) => {
	if (error instanceof ContainerFilesystemError) {
		if (error.code === "CONTAINER_NOT_FOUND") return 404;
		if (error.code === "FILE_TOO_LARGE") return 413;
		return 400;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
	) {
		return 403;
	}

	return 500;
};

const errorMessage = (error: unknown) =>
	error instanceof Error
		? error.message
		: "Unable to upload the file to the container.";

const readRequestBody = (
	req: NextApiRequest,
	maxBytes: number,
): Promise<Buffer> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		let rejected = false;

		req.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total > maxBytes) {
				// Do NOT destroy req here: it shares its socket with res, so
				// destroying it now would drop the connection before the 413
				// response below can reach the client. Instead, stop buffering
				// and pause the stream so Node stops reading more of a
				// potentially huge remaining body off the socket — the caller
				// destroys req itself, but only once the response has actually
				// been flushed (see the FILE_TOO_LARGE handling in `handler`).
				if (!rejected) {
					rejected = true;
					req.pause();
					reject(
						new ContainerFilesystemError(
							"FILE_TOO_LARGE",
							`Uploads are limited to ${Math.floor(maxBytes / (1024 * 1024))}MB.`,
						),
					);
				}
				return;
			}
			chunks.push(chunk);
		});
		req.once("end", () => {
			if (!rejected) resolve(Buffer.concat(chunks));
		});
		req.once("error", (error) => {
			if (!rejected) {
				rejected = true;
				reject(error);
			}
		});
	});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST");
		res.status(405).json({ message: "Method not allowed" });
		return;
	}

	const serviceType = getSingleQueryValue(req.query.serviceType);
	const serviceId = getSingleQueryValue(req.query.serviceId);
	const containerId = getSingleQueryValue(req.query.containerId);
	const path = getSingleQueryValue(req.query.path);
	const fileName = getSingleQueryValue(req.query.fileName);

	if (
		!isFilesystemServiceType(serviceType) ||
		!serviceId ||
		!containerId ||
		!path ||
		!fileName
	) {
		res.status(400).json({ message: "Missing upload parameters" });
		return;
	}

	const { session, user } = await validateRequest(req);
	if (!user || !session?.activeOrganizationId) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	try {
		const { container } = await getAuthorizedServiceFilesystemContainer(
			{
				user: { id: user.id },
				session: { activeOrganizationId: session.activeOrganizationId },
			},
			serviceType,
			serviceId,
			containerId,
			["read", "write"],
		);

		const fileBuffer = await readRequestBody(req, MAX_FILE_UPLOAD_BYTES);
		const entry = await uploadFileToContainerDirectory(
			container,
			path,
			fileName,
			fileBuffer,
		);

		res.status(200).json({ entry });
	} catch (error) {
		res.status(errorStatus(error)).json({ message: errorMessage(error) });

		const isOversizedUpload =
			error instanceof ContainerFilesystemError &&
			error.code === "FILE_TOO_LARGE";
		if (isOversizedUpload) {
			// The request stream was paused with an unread remainder still
			// sitting on the socket. Now that the response has been handed
			// to Node, drop the connection once it's actually been flushed
			// to the client instead of receiving and discarding the rest of
			// a potentially huge body.
			res.once("finish", () => {
				if (!req.destroyed) req.destroy();
			});
		}
	}
};

export default handler;
