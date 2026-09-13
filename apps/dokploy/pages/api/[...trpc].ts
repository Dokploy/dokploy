import {
	OPENAPI_MAX_JSON_BODY_SIZE,
	OPENAPI_MAX_UPLOAD_SIZE,
	validateRequest,
} from "@dokploy/server";
import { createOpenApiNextHandler } from "@dokploy/trpc-openapi";
import type { NextApiRequest, NextApiResponse } from "next";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	const { session, user } = await validateRequest(req);

	if (!user || !session) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	// getMultipartBody doesn't accept maxBodySize, so we cap it here instead.
	const contentLength = Number(req.headers["content-length"]);
	const isMultipart = req.headers["content-type"]?.startsWith(
		"multipart/form-data",
	);

	if (isMultipart && !Number.isFinite(contentLength)) {
		res.status(411).json({ message: "Content-Length required" });
		return;
	}

	const limit = isMultipart
		? OPENAPI_MAX_UPLOAD_SIZE
		: OPENAPI_MAX_JSON_BODY_SIZE;

	if (Number.isFinite(contentLength) && contentLength > limit) {
		res.status(413).json({ message: "Payload too large" });
		return;
	}

	// @ts-ignore
	return createOpenApiNextHandler({
		router: appRouter,
		createContext: createTRPCContext,
		maxBodySize: OPENAPI_MAX_JSON_BODY_SIZE,
		onError:
			process.env.NODE_ENV === "development"
				? ({ path, error }: { path: string | undefined; error: Error }) => {
						console.error(
							`❌ OpenAPI failed on ${path ?? "<no-path>"}: ${error.message}`,
						);
					}
				: undefined,
	})(req, res);
};

export default handler;

export const config = {
	api: {
		bodyParser: false,
	},
};
