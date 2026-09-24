import { EventEmitter } from "node:events";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

const mocks = vi.hoisted(() => ({
	validateRequest: vi.fn(),
	canAccess: vi.fn(),
	hostStats: vi.fn(),
	recordStats: vi.fn(),
	readStats: vi.fn(),
	listContainers: vi.fn(),
	exec: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	validateRequest: mocks.validateRequest,
	getHostSystemStats: mocks.hostStats,
	recordAdvancedStats: mocks.recordStats,
	getLastAdvancedStatsFile: mocks.readStats,
	docker: { listContainers: mocks.listContainers },
	execAsync: mocks.exec,
}));
vi.mock("../../server/wss/authorize", () => ({
	canAccessDockerOverWss: mocks.canAccess,
}));

import { setupDockerStatsMonitoringSocketServer } from "../../server/wss/docker-stats";

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};

describe("monitoring socket lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		mocks.validateRequest.mockResolvedValue({ user: {}, session: {} });
		mocks.canAccess.mockResolvedValue(true);
		mocks.hostStats.mockResolvedValue({});
		mocks.readStats.mockResolvedValue([]);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const connect = async (appName = "dokploy") => {
		let handler!: (ws: WebSocket, req: http.IncomingMessage) => Promise<void>;
		vi.spyOn(WebSocketServer.prototype, "on").mockImplementation(function (
			this: WebSocketServer,
			event,
			listener,
		) {
			if (event === "connection")
				handler = listener as unknown as typeof handler;
			return this;
		});
		setupDockerStatsMonitoringSocketServer(new EventEmitter() as http.Server);
		const ws = Object.assign(new EventEmitter(), {
			readyState: WebSocket.OPEN as number,
			send: vi.fn(),
			close: vi.fn(),
		});
		const pending = handler(
			ws as unknown as WebSocket,
			{
				url: `/listen-docker-stats-monitoring?appName=${appName}`,
				headers: { host: "localhost" },
			} as http.IncomingMessage,
		);
		const disconnect = () => {
			ws.readyState = WebSocket.CLOSED;
			ws.emit("close");
		};
		return { ws, pending, disconnect };
	};

	it.each(["authentication", "authorization"])(
		"does not start polling after disconnect during %s",
		async (stage) => {
			const gate = deferred<any>();
			if (stage === "authentication")
				mocks.validateRequest.mockReturnValue(gate.promise);
			else mocks.canAccess.mockReturnValue(gate.promise);
			const socket = await connect();
			socket.disconnect();
			gate.resolve(
				stage === "authentication" ? { user: {}, session: {} } : true,
			);
			await socket.pending;
			await vi.advanceTimersByTimeAsync(3900);
			expect(vi.getTimerCount()).toBe(0);
			expect(mocks.hostStats).not.toHaveBeenCalled();
			expect(mocks.recordStats).not.toHaveBeenCalled();
		},
	);

	it("stops an established polling interval on disconnect", async () => {
		const socket = await connect();
		await socket.pending;
		await vi.advanceTimersByTimeAsync(1300);
		expect(mocks.recordStats).toHaveBeenCalledOnce();
		socket.disconnect();
		await vi.advanceTimersByTimeAsync(3900);
		expect(mocks.recordStats).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("discards statistics collected after disconnect", async () => {
		const gate = deferred<object>();
		mocks.hostStats.mockReturnValue(gate.promise);
		const socket = await connect();
		await socket.pending;
		await vi.advanceTimersByTimeAsync(1300);
		socket.disconnect();
		gate.resolve({});
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.recordStats).not.toHaveBeenCalled();
		expect(socket.ws.send).not.toHaveBeenCalled();
	});

	it("discards container statistics collected after disconnect", async () => {
		const gate = deferred<{ stdout: string; stderr: string }>();
		mocks.listContainers.mockResolvedValue([
			{ Id: "container", State: "running" },
		]);
		mocks.exec.mockReturnValue(gate.promise);
		const socket = await connect("application");
		await socket.pending;
		await vi.advanceTimersByTimeAsync(1300);
		expect(mocks.exec).toHaveBeenCalledOnce();
		socket.disconnect();
		gate.resolve({ stdout: "{}", stderr: "" });
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.recordStats).not.toHaveBeenCalled();
		expect(socket.ws.send).not.toHaveBeenCalled();
	});
});
