import {
	ContainerFilesystemError,
	getContainerFileDownload,
	pipeContainerFileArchive,
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
		responseLimit: false,
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
		return error.code === "CONTAINER_NOT_FOUND" ? 404 : 400;
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
		: "Unable to download the selected container file.";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		res.status(405).json({ message: "Method not allowed" });
		return;
	}

	const serviceType = getSingleQueryValue(req.query.serviceType);
	const serviceId = getSingleQueryValue(req.query.serviceId);
	const containerId = getSingleQueryValue(req.query.containerId);
	const path = getSingleQueryValue(req.query.path);

	if (!isFilesystemServiceType(serviceType) || !serviceId || !containerId || !path) {
		res.status(400).json({ message: "Missing download parameters" });
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
		);
		const download = await getContainerFileDownload(container, path);

		res.statusCode = 200;
		res.setHeader("Content-Type", "application/octet-stream");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader("Cache-Control", "no-store");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
		);
		// The container can change between metadata inspection and streaming, so
		// omit Content-Length and let the bounded archive stream use chunked output.

		const abort = () => {
			download.archive.destroy();
		};
		req.once("aborted", abort);
		res.once("close", abort);

		try {
			await pipeContainerFileArchive(download.archive, res);
			if (!res.writableEnded) {
				res.end();
			}
		} finally {
			req.off("aborted", abort);
			res.off("close", abort);
		}
	} catch (error) {
		if (res.headersSent) {
			res.destroy(error instanceof Error ? error : undefined);
			return;
		}

		res.status(errorStatus(error)).json({ message: errorMessage(error) });
	}
};

export default handler;
