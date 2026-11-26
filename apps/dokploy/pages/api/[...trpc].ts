import {
	emitAuditEvent,
	OPENAPI_MAX_JSON_BODY_SIZE,
	OPENAPI_MAX_UPLOAD_SIZE,
	requestAuditFields,
	validateRequest,
} from "@dokploy/server";
import { createOpenApiNextHandler } from "@dokploy/trpc-openapi";
import type { NextApiRequest, NextApiResponse } from "next";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

// Rejected here, these requests never reach the tRPC audit middleware.
const auditRejected = (
	req: NextApiRequest,
	status: number,
	actor?: Awaited<ReturnType<typeof validateRequest>>,
) =>
	emitAuditEvent({
		source: "http",
		path: (req.url || "").split("?")[0],
		type: req.method,
		ok: false,
		errorCode: String(status),
		...requestAuditFields(req, actor?.session, actor?.user),
		...(!actor?.session && req.headers["x-api-key"]
			? { authMethod: "apiKey" as const }
			: {}),
	});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	const result = await validateRequest(req);

	if ("rateLimited" in result && result.rateLimited) {
		const { retryAfterSeconds } = result.rateLimited;
		if (retryAfterSeconds) {
			res.setHeader("Retry-After", retryAfterSeconds);
		}
		auditRejected(req, 429);
		res.status(429).json({ message: "Rate limit exceeded" });
		return;
	}

	const { session, user } = result;

	if (!user || !session) {
		// Only rejected credentials; anonymous scans would flood the stream.
		if (req.headers["x-api-key"] || req.headers.cookie) auditRejected(req, 401);
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	// getMultipartBody doesn't accept maxBodySize, so we cap it here instead.
	const contentLength = Number(req.headers["content-length"]);
	const isMultipart = req.headers["content-type"]?.startsWith(
		"multipart/form-data",
	);

	if (isMultipart && !Number.isFinite(contentLength)) {
		auditRejected(req, 411, result);
		res.status(411).json({ message: "Content-Length required" });
		return;
	}

	const limit = isMultipart
		? OPENAPI_MAX_UPLOAD_SIZE
		: OPENAPI_MAX_JSON_BODY_SIZE;

	if (Number.isFinite(contentLength) && contentLength > limit) {
		auditRejected(req, 413, result);
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
