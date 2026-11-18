import http from "node:http";
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

let server: http.Server;
let base: string;

beforeEach(async () => {
	vi.clearAllMocks();
	mockSpawn.mockReturnValue({ onData: vi.fn(), kill: vi.fn(), write: vi.fn() });
	server = http.createServer();
	setupDockerContainerLogsWebSocketServer(server);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	base = `ws://127.0.0.1:${port}/docker-container-logs`;
});

afterEach(async () => {
	await new Promise((r) => server.close(r));
});

describe("docker container logs search", () => {
	it("passes a dash-prefixed search to grep as a pattern, not options", async () => {
		const ws = new WebSocket(`${base}?containerId=abc123&search=-rea`);
		ws.on("error", () => {});
		await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
		ws.close();

		const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
		expect(args[1]).toMatch(/\| grep -iF -- '-rea'$/);
	});
});
