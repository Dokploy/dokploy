import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (...args: any[]) => unknown>(),
	listContainers: vi.fn(),
	execAsync: vi.fn(),
	recordAdvancedStats: vi.fn(),
	getLastAdvancedStatsFile: vi.fn(() => Promise.resolve({})),
}));

vi.mock("ws", () => ({
	WebSocketServer: vi.fn(function WebSocketServer() {
		return {
			on: vi.fn((event: string, handler: (...args: any[]) => unknown) => {
				mocks.handlers.set(event, handler);
			}),
			handleUpgrade: vi.fn(),
			emit: vi.fn(),
		};
	}),
}));

vi.mock("@dokploy/server", () => ({
	docker: { listContainers: mocks.listContainers },
	execAsync: mocks.execAsync,
	getHostSystemStats: vi.fn(),
	getLastAdvancedStatsFile: mocks.getLastAdvancedStatsFile,
	IS_CLOUD: false,
	recordAdvancedStats: mocks.recordAdvancedStats,
	validateRequest: vi.fn(() =>
		Promise.resolve({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		}),
	),
}));

vi.mock("@/server/wss/authorize", () => ({
	canAccessDockerOverWss: vi.fn(() => Promise.resolve(true)),
}));

import { setupDockerStatsMonitoringSocketServer } from "@/server/wss/docker-stats";

const STATS_JSON =
	'{"BlockIO":"0B / 0B","CPUPerc":"1%","Container":"app","ID":"container-1","MemPerc":"2%","MemUsage":"1MiB / 2MiB","Name":"app","NetIO":"0B / 0B"}';

const flush = async () => {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve();
	}
};

const createSocket = () => ({
	OPEN: 1,
	readyState: 1,
	send: vi.fn(),
	close: vi.fn(),
	on: vi.fn(),
});

const connect = async (ws: ReturnType<typeof createSocket>) => {
	setupDockerStatsMonitoringSocketServer({ on: vi.fn() } as never);
	const onConnection = mocks.handlers.get("connection");
	if (!onConnection) throw new Error("connection handler was never registered");
	await onConnection(ws, {
		url: "/listen-docker-stats-monitoring?appName=app&appType=application&serviceId=svc-1",
		headers: { host: "localhost" },
	});
	await flush();
};

describe("Docker stats monitoring socket", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mocks.handlers.clear();
		mocks.listContainers.mockResolvedValue([
			{ Id: "container-1", State: "running" },
		]);
		mocks.execAsync.mockResolvedValue({ stdout: STATS_JSON, stderr: "" });
		mocks.recordAdvancedStats.mockResolvedValue({
			cpu: { value: "1%", time: new Date() },
			memory: null,
			disk: null,
			network: null,
			block: null,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not start a new poll while the previous one is still running", async () => {
		// `docker stats --no-stream` routinely outlasts the 1300ms interval on
		// hosts with many containers; the timer must not stack calls on top of it.
		let releaseStats: (value: { stdout: string; stderr: string }) => void =
			() => {};
		mocks.execAsync.mockReturnValue(
			new Promise((resolve) => {
				releaseStats = resolve;
			}),
		);

		const ws = createSocket();
		await connect(ws);

		for (let tick = 0; tick < 5; tick++) {
			await vi.advanceTimersByTimeAsync(1300);
		}

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);

		releaseStats({ stdout: STATS_JSON, stderr: "" });
		await flush();

		await vi.advanceTimersByTimeAsync(1300);
		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
	});

	it("keeps polling once a slow poll has settled", async () => {
		const ws = createSocket();
		await connect(ws);

		await vi.advanceTimersByTimeAsync(1300);
		await vi.advanceTimersByTimeAsync(1300);

		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
		expect(ws.send).toHaveBeenCalledTimes(2);
	});

	it("skips polling when the socket is no longer open", async () => {
		const ws = createSocket();
		await connect(ws);

		ws.readyState = 3; // CLOSED
		await vi.advanceTimersByTimeAsync(1300 * 3);

		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("sends the freshly recorded sample without reading it back from disk", async () => {
		const ws = createSocket();
		await connect(ws);

		await vi.advanceTimersByTimeAsync(1300);

		expect(mocks.recordAdvancedStats).toHaveBeenCalledTimes(1);
		expect(mocks.getLastAdvancedStatsFile).not.toHaveBeenCalled();

		const payload = JSON.parse(ws.send.mock.calls[0]?.[0] as string);
		expect(payload.data.cpu.value).toBe("1%");
	});
});
