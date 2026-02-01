import type { NextApiRequest, NextApiResponse } from "next";
import {
	TRAEFIK_PAGE_STATUSES,
	readTraefikPagesConfig,
	renderTraefikErrorPage,
	type TraefikPageStatus,
} from "@dokploy/server";

const getHeaderValue = (value?: string | string[]) => {
	if (!value) return undefined;
	return Array.isArray(value) ? value[0] : value;
};

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	const statusParam = Array.isArray(req.query.status)
		? req.query.status[0]
		: req.query.status;

	if (!statusParam || !TRAEFIK_PAGE_STATUSES.includes(statusParam as any)) {
		res.status(404).send("Not found");
		return;
	}

	const status = statusParam as TraefikPageStatus;
	const config = await readTraefikPagesConfig();

	const requestId = getHeaderValue(req.headers["x-request-id"]);
	const host =
		getHeaderValue(req.headers["x-forwarded-host"]) ||
		getHeaderValue(req.headers.host);
	const path =
		getHeaderValue(req.headers["x-forwarded-uri"]) ||
		getHeaderValue(req.headers["x-original-uri"]) ||
		req.url;
	const method =
		getHeaderValue(req.headers["x-forwarded-method"]) || req.method;
	const protocol =
		getHeaderValue(req.headers["x-forwarded-proto"]) || "https";

	const html = renderTraefikErrorPage(config, status, {
		status,
		requestId,
		host,
		path,
		method,
		protocol,
		timestamp: new Date().toISOString(),
	});

	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "public, max-age=60");
	res.status(Number(status)).send(html);
}
