import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const mockValidateRequest = vi.hoisted(() => vi.fn());
const mockRecordAdvancedStats = vi.hoisted(() => vi.fn());
const mockListContainers = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	docker: { listContainers: mockListContainers },
	execAsync: vi.fn(),
	getHostSystemStats: vi.fn(async () => ({})),
	getLastAdvancedStatsFile: vi.fn(async () => ({})),
	recordAdvancedStats: mockRecordAdvancedStats,
	validateRequest: mockValidateRequest,
}));

const mockFindServiceAppName = vi.hoisted(() => vi.fn());
vi.mock("@/server/wss/container-ownership", () => ({
	findServiceAppName: mockFindServiceAppName,
}));
vi.mock("@/server/wss/authorize", () => ({
	canAccessDockerOverWss: vi.fn(async () => true),
	isServiceContainerName: vi.fn(() => true),
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: http.Server;
let url: string;

beforeEach(async () => {
	vi.clearAllMocks();
	server = http.createServer();
	setupDockerStatsMonitoringSocketServer(server);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	url = `ws://127.0.0.1:${port}/listen-docker-stats-monitoring?appName=dokploy`;
});

afterEach(async () => {
	await new Promise((r) => server.close(r));
});

const connect = async (query = "") => {
	const ws = new WebSocket(`${url}${query}`);
	await new Promise((r) => ws.once("open", r));
	return ws;
};

const closeClient = async (ws: WebSocket) => {
	ws.close();
	await new Promise((r) => ws.once("close", r));
	await sleep(50);
};

describe("docker stats websocket (#5504)", () => {
	it("records stats while connected and stops after disconnect", async () => {
		mockValidateRequest.mockResolvedValue(AUTH);
		const ws = await connect();
		await sleep(1500);
		expect(mockRecordAdvancedStats).toHaveBeenCalled();

		await closeClient(ws);
		const callsAtClose = mockRecordAdvancedStats.mock.calls.length;
		await sleep(1500);
		expect(mockRecordAdvancedStats).toHaveBeenCalledTimes(callsAtClose);
	});

	it("does not start polling when the client disconnects during auth", async () => {
		const auth = deferred<typeof AUTH>();
		mockValidateRequest.mockReturnValue(auth.promise);
		const ws = await connect();

		await closeClient(ws);
		auth.resolve(AUTH);
		await sleep(1500);

		expect(mockRecordAdvancedStats).not.toHaveBeenCalled();
	});

	it("does not start polling when the client disconnects while resolving the service", async () => {
		mockValidateRequest.mockResolvedValue(AUTH);
		const lookup = deferred<string>();
		mockFindServiceAppName.mockReturnValue(lookup.promise);
		const ws = await connect("&serviceId=svc-1");

		await closeClient(ws);
		lookup.resolve("dokploy");
		await sleep(1500);

		expect(mockListContainers).not.toHaveBeenCalled();
	});
});
