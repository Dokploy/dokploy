import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

const emitAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server", async () => ({
	IS_CLOUD: true,
	emitAuditEvent,
	requestNetworkFields: (await import("@dokploy/server/lib/audit-stream"))
		.requestNetworkFields,
}));

import { auditHttpRequest } from "@/server/utils/http-audit";

const run = (
	url: string,
	statusCode: number,
	headers = {},
	writableFinished = true,
) => {
	emitAuditEvent.mockClear();
	const req = {
		url,
		method: "POST",
		headers,
		socket: { remoteAddress: "10.0.0.1" },
	} as unknown as IncomingMessage;
	const res = Object.assign(new EventEmitter(), {
		statusCode,
		writableFinished,
	}) as unknown as ServerResponse;
	auditHttpRequest(req, res);
	res.emit("close");
	return emitAuditEvent.mock.calls[0]?.[0];
};

describe("auditHttpRequest", () => {
	it("logs webhook calls under the route pattern, never the token", () => {
		const event = run("/api/deploy/secret-refresh-token?x=1", 200, {
			"x-github-event": "push",
		});
		expect(event).toMatchObject({
			source: "http",
			path: "/api/deploy/[refreshToken]",
			type: "POST",
			ok: true,
			metadata: { event: "push" },
			ip: "10.0.0.1",
		});
		expect(event.errorCode).toBeUndefined();
		expect(JSON.stringify(event)).not.toContain("secret-refresh-token");
		expect(run("/api/deploy/compose/tok", 401).path).toBe(
			"/api/deploy/compose/[refreshToken]",
		);
		expect(run("/api/connect/tok", 403)).toMatchObject({
			path: "/api/connect/[token]",
			ok: false,
		});
		expect(run("/api/providers/github/setup?code=abc", 302).path).toBe(
			"/api/providers/github/setup",
		);
	});

	it("marks aborted requests as failed", () => {
		expect(run("/api/deploy/tok", 200, {}, false)).toMatchObject({
			ok: false,
			errorCode: "aborted",
		});
	});

	it("ignores routes audited elsewhere", () => {
		expect(run("/api/trpc/project.create", 200)).toBeUndefined();
		expect(run("/api/auth/sign-in/email", 200)).toBeUndefined();
		expect(run("/dashboard/projects", 200)).toBeUndefined();
	});
});
