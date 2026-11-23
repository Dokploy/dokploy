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
const mockBelongs = vi.hoisted(() => vi.fn());
vi.mock("@/server/wss/container-ownership", () => ({
	containerBelongsToService: mockBelongs,
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

const closeCode = (query: string) =>
	new Promise<number | null>((resolve) => {
		const ws = new WebSocket(`${base}?${query}`);
		ws.once("close", (code) => resolve(code));
		setTimeout(() => {
			resolve(null);
			ws.close();
		}, 300);
	});

describe("docker container logs websocket", () => {
	it("denies a container outside the service", async () => {
		mockBelongs.mockResolvedValue(false);
		expect(
			await closeCode(
				"containerId=dokploy-postgres&runType=native&serviceId=svc-1",
			),
		).toBe(4003);
		expect(mockBelongs).toHaveBeenCalledWith(
			"svc-1",
			"dokploy-postgres",
			null,
			"native",
		);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it("streams logs of a container of the service", async () => {
		mockBelongs.mockResolvedValue(true);
		expect(
			await closeCode("containerId=task1&runType=swarm&serviceId=svc-1"),
		).toBeNull();
		expect(mockSpawn).toHaveBeenCalled();
	});
});
