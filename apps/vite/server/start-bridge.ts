import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

interface FetchHandler {
	fetch: (request: Request) => Response | Promise<Response>;
}

export const createStartBridge = (handler: FetchHandler) => {
	return async (req: IncomingMessage, res: ServerResponse) => {
		const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value === undefined) continue;
			if (Array.isArray(value)) {
				for (const item of value) headers.append(key, item);
			} else {
				headers.set(key, value);
			}
		}
		const method = req.method ?? "GET";
		const hasBody = method !== "GET" && method !== "HEAD";
		const request = new Request(url, {
			method,
			headers,
			...(hasBody
				? {
						body: Readable.toWeb(req) as unknown as ReadableStream,
						duplex: "half",
					}
				: {}),
		} as RequestInit);

		const response = await handler.fetch(request);

		const outHeaders: Record<string, string | string[]> = {};
		response.headers.forEach((value, key) => {
			if (key === "set-cookie") return;
			outHeaders[key] = value;
		});
		const setCookies = response.headers.getSetCookie();
		if (setCookies.length > 0) {
			outHeaders["set-cookie"] = setCookies;
		}

		res.writeHead(response.status, outHeaders);
		if (response.body) {
			Readable.fromWeb(response.body as never).pipe(res);
		} else {
			res.end();
		}
	};
};
