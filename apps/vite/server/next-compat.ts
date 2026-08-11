import type { IncomingMessage, ServerResponse } from "node:http";
import { buffer } from "node:stream/consumers";

type NextStyleHandler = (req: any, res: any) => unknown | Promise<unknown>;

interface RunOptions {
	params?: Record<string, string | string[]>;
	parseBody?: boolean;
}

const parseCookies = (header: string | undefined) => {
	const cookies: Record<string, string> = {};
	if (!header) return cookies;
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		const key = part.slice(0, index).trim();
		const value = part.slice(index + 1).trim();
		if (key) cookies[key] = decodeURIComponent(value);
	}
	return cookies;
};

const parseQuery = (url: URL, params: Record<string, string | string[]>) => {
	const query: Record<string, string | string[]> = {};
	for (const [key, value] of url.searchParams) {
		const existing = query[key];
		if (existing === undefined) {
			query[key] = value;
		} else if (Array.isArray(existing)) {
			existing.push(value);
		} else {
			query[key] = [existing, value];
		}
	}
	Object.assign(query, params);
	return query;
};

const parseBody = async (req: IncomingMessage) => {
	if (req.method === "GET" || req.method === "HEAD") return undefined;
	const raw = await buffer(req);
	if (raw.length === 0) return undefined;
	const contentType = req.headers["content-type"] ?? "";
	const text = raw.toString("utf8");
	if (contentType.includes("application/json")) {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}
	if (contentType.includes("application/x-www-form-urlencoded")) {
		return Object.fromEntries(new URLSearchParams(text));
	}
	return text;
};

const enhanceResponse = (res: ServerResponse) => {
	const anyRes = res as any;
	anyRes.status = (code: number) => {
		res.statusCode = code;
		return anyRes;
	};
	anyRes.json = (data: unknown) => {
		if (!res.headersSent && !res.getHeader("content-type")) {
			res.setHeader("content-type", "application/json; charset=utf-8");
		}
		res.end(JSON.stringify(data));
		return anyRes;
	};
	anyRes.send = (data: unknown) => {
		if (typeof data === "string" || Buffer.isBuffer(data)) {
			res.end(data);
		} else if (data === undefined || data === null) {
			res.end();
		} else {
			anyRes.json(data);
		}
		return anyRes;
	};
	anyRes.redirect = (statusOrUrl: number | string, maybeUrl?: string) => {
		const statusCode = typeof statusOrUrl === "number" ? statusOrUrl : 307;
		const location =
			typeof statusOrUrl === "string" ? statusOrUrl : (maybeUrl ?? "/");
		res.writeHead(statusCode, { location });
		res.end();
		return anyRes;
	};
	return anyRes;
};

export const runNextApiHandler = async (
	handler: NextStyleHandler,
	req: IncomingMessage,
	res: ServerResponse,
	options: RunOptions = {},
) => {
	const url = new URL(req.url ?? "/", "http://localhost");
	const anyReq = req as any;
	anyReq.query = parseQuery(url, options.params ?? {});
	anyReq.cookies = parseCookies(req.headers.cookie);
	if (options.parseBody !== false) {
		anyReq.body = await parseBody(req);
	}
	await handler(anyReq, enhanceResponse(res));
};
