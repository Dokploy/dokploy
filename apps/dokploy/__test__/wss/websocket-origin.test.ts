import http, { type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock("node-pty", () => ({ spawn: mockSpawn }));
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findServerById: vi.fn(),
	validateRequest: vi.fn(async () => ({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	})),
}));
vi.mock("@/server/wss/authorize", () => ({
	canAccessDockerOverWss: vi.fn(async () => true),
}));
vi.mock("@/server/wss/container-ownership", () => ({
	containerBelongsToService: vi.fn(async () => true),
}));

import { setupDockerContainerLogsWebSocketServer } from "@/server/wss/docker-container-logs";
import { isAllowedWebSocketOrigin } from "@/server/wss/utils";

const req = (headers: Record<string, string>) =>
	({ headers }) as unknown as IncomingMessage;

describe("isAllowedWebSocketOrigin", () => {
	it("allows clients that send no Origin", () => {
		expect(isAllowedWebSocketOrigin(req({ host: "dokploy.example.com" }))).toBe(
			true,
		);
	});

	it("allows a same-origin page", () => {
		expect(
			isAllowedWebSocketOrigin(
				req({
					host: "dokploy.example.com",
					origin: "https://dokploy.example.com",
				}),
			),
		).toBe(true);
		expect(
			isAllowedWebSocketOrigin(
				req({ host: "10.0.0.5:3000", origin: "http://10.0.0.5:3000" }),
			),
		).toBe(true);
	});

	it("allows the original host forwarded by a reverse proxy", () => {
		expect(
			isAllowedWebSocketOrigin(
				req({
					host: "dokploy:3000",
					"x-forwarded-host": "dokploy.example.com",
					origin: "https://dokploy.example.com",
				}),
			),
		).toBe(true);
	});

	it("rejects a page on a sibling subdomain", () => {
		expect(
			isAllowedWebSocketOrigin(
				req({
					host: "dokploy.example.com",
					origin: "https://app.example.com",
				}),
			),
		).toBe(false);
	});

	it("rejects opaque and malformed origins", () => {
		expect(
			isAllowedWebSocketOrigin(
				req({ host: "dokploy.example.com", origin: "null" }),
			),
		).toBe(false);
		expect(
			isAllowedWebSocketOrigin(
				req({ host: "dokploy.example.com", origin: "file://" }),
			),
		).toBe(false);
	});
});

describe("websocket handshake origin check", () => {
	let server: http.Server;
	let base: string;
	let sameOrigin: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockSpawn.mockReturnValue({
			onData: vi.fn(),
			kill: vi.fn(),
			write: vi.fn(),
		});
		server = http.createServer();
		setupDockerContainerLogsWebSocketServer(server);
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const { port } = server.address() as AddressInfo;
		base = `ws://127.0.0.1:${port}/docker-container-logs?containerId=abc123`;
		sameOrigin = `http://127.0.0.1:${port}`;
	});

	afterEach(async () => {
		await new Promise((r) => server.close(r));
	});

	const handshakeStatus = (origin: string) =>
		new Promise<number>((resolve) => {
			const ws = new WebSocket(base, { origin });
			ws.on("error", () => {});
			ws.once("unexpected-response", (request, res) => {
				resolve(res.statusCode ?? 0);
				request.destroy();
			});
			ws.once("open", () => {
				resolve(101);
				ws.close();
			});
		});

	it("refuses a cross-origin handshake before running anything", async () => {
		expect(await handshakeStatus("https://evil.example.com")).toBe(401);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it("accepts a same-origin handshake", async () => {
		expect(await handshakeStatus(sameOrigin)).toBe(101);
	});
});
