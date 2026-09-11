import type { IncomingMessage, ServerResponse } from "node:http";
import { auth } from "@dokploy/server/index";
import { toNodeHandler } from "better-auth/node";
import { isHttpsRequest, secureSetCookie } from "@/lib/secure-cookies";

// Disallow body parsing, we will parse it manually
export const config = { api: { bodyParser: false } };

const handler = toNodeHandler(auth.handler);

// Mark the session cookie as Secure when the request comes over HTTPS
export default function authHandler(req: IncomingMessage, res: ServerResponse) {
	if (isHttpsRequest(req.headers["x-forwarded-proto"])) {
		const setHeader = res.setHeader.bind(res);
		res.setHeader = (name, value) =>
			String(name).toLowerCase() === "set-cookie"
				? setHeader(name, secureSetCookie(value))
				: setHeader(name, value);

		const appendHeader = res.appendHeader?.bind(res);
		if (appendHeader) {
			res.appendHeader = (name, value) =>
				String(name).toLowerCase() === "set-cookie"
					? appendHeader(name, secureSetCookie(value) as string | string[])
					: appendHeader(name, value);
		}
	}

	return handler(req, res);
}
