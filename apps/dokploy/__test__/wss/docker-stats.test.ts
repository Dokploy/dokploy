import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const mockValidateRequest = vi.hoisted(() => vi.fn());
const mockGetHostSystemStats = vi.hoisted(() => vi.fn());
const mockRecordAdvancedStats = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	validateRequest: mockValidateRequest,
	getHostSystemStats: mockGetHostSystemStats,
	recordAdvancedStats: mockRecordAdvancedStats,
	getLastAdvancedStatsFile: vi.fn(async () => ({})),
	docker: { listContainers: vi.fn(async () => []) },
	execAsync: vi.fn(),
}));
vi.mock("@/server/wss/authorize", () => ({
	canAccessDockerOverWss: vi.fn(async () => true),
}));

import { setupDockerStatsMonitoringSocketServer } from "@/server/wss/docker-stats";

const AUTH = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POLL_INTERVAL = 1300;

let server: http.Server;
let url: string;

beforeEach(async () => {
	vi.clearAllMocks();
	mockGetHostSystemStats.mockResolvedValue({});
	server = http.createServer();
	setupDockerStatsMonitoringSocketServer(server);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	url = `ws://127.0.0.1:${port}/listen-docker-stats-monitoring?appName=dokploy`;
});

afterEach(async () => {
	await new Promise((r) => server.close(r));
});

const connect = async () => {
	const ws = new WebSocket(url);
	await new Promise((r) => ws.once("open", r));
	return ws;
};

const closeClient = async (ws: WebSocket) => {
	ws.close();
	await new Promise((r) => ws.once("close", r));
	await wait(50);
};

describe("docker stats websocket (#5504)", () => {
	it("stops polling when the client disconnects", async () => {
		mockValidateRequest.mockResolvedValue(AUTH);
		const ws = await connect();
		await wait(POLL_INTERVAL + 200);
		expect(mockRecordAdvancedStats).toHaveBeenCalledTimes(1);

		await closeClient(ws);
		await wait(POLL_INTERVAL + 200);
		expect(mockRecordAdvancedStats).toHaveBeenCalledTimes(1);
	});

	it("does not start polling when the client disconnects during auth", async () => {
		const auth = deferred<typeof AUTH>();
		mockValidateRequest.mockReturnValue(auth.promise);
		const ws = await connect();

		await closeClient(ws);
		auth.resolve(AUTH);
		await wait(POLL_INTERVAL + 200);

		expect(mockRecordAdvancedStats).not.toHaveBeenCalled();
	});
});
