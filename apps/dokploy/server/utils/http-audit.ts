import type { IncomingMessage, ServerResponse } from "node:http";
import {
	emitAuditEvent,
	IS_CLOUD,
	requestNetworkFields,
} from "@dokploy/server";

// Tokens in these paths are credentials, so the event keeps the route pattern instead.
const AUDITED_ROUTES: Array<[RegExp, string | null]> = [
	[/^\/api\/deploy\/compose\/[^/]+$/, "/api/deploy/compose/[refreshToken]"],
	[/^\/api\/deploy\/github$/, "/api/deploy/github"],
	[/^\/api\/deploy\/[^/]+$/, "/api/deploy/[refreshToken]"],
	[/^\/api\/connect\/[^/]+$/, "/api/connect/[token]"],
	[/^\/api\/stripe\/webhook$/, "/api/stripe/webhook"],
	[/^\/api\/providers\/[\w/-]+$/, null],
];

const WEBHOOK_EVENT_HEADERS = [
	"x-github-event",
	"x-gitlab-event",
	"x-gitea-event",
	"x-event-key",
];

export const auditHttpRequest = (req: IncomingMessage, res: ServerResponse) => {
	if (!IS_CLOUD) return;
	const pathname = (req.url || "").split("?")[0] ?? "";
	const route = AUDITED_ROUTES.find(([pattern]) => pattern.test(pathname));
	if (!route) return;
	const startedAt = Date.now();
	res.once("close", () => {
		const event = WEBHOOK_EVENT_HEADERS.map((name) => req.headers[name]).find(
			Boolean,
		);
		// "close" without a finished response means the client aborted before we answered.
		const ok = res.writableFinished && res.statusCode < 400;
		emitAuditEvent({
			source: "http",
			path: route[1] ?? pathname,
			type: req.method,
			ok,
			errorCode: ok
				? undefined
				: res.writableFinished
					? String(res.statusCode)
					: "aborted",
			durationMs: Date.now() - startedAt,
			metadata: event ? { event } : undefined,
			...requestNetworkFields(req.headers, req.socket.remoteAddress),
		});
	});
};
