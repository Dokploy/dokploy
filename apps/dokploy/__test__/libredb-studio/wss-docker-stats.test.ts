import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wss = vi.hoisted(() => ({
	connections: {} as Record<string, (ws: unknown, req: unknown) => unknown>,
}));
vi.mock("ws", () => ({
	WebSocketServer: class {
		path: string;
		constructor(options: { path: string }) {
			this.path = options.path;
		}
		on(event: string, listener: (ws: unknown, req: unknown) => unknown) {
			if (event === "connection") wss.connections[this.path] = listener;
		}
	},
}));

const server = vi.hoisted(() => ({
	IS_CLOUD: false,
	docker: { listContainers: vi.fn() },
	execAsync: vi.fn(),
	getHostSystemStats: vi.fn(),
	getLastAdvancedStatsFile: vi.fn(),
	recordAdvancedStats: vi.fn(),
	validateRequest: vi.fn(),
}));
vi.mock("@dokploy/server", () => server);

const authorize = vi.hoisted(() => ({ resolveDockerStatsOverWss: vi.fn() }));
vi.mock("@/server/wss/authorize", () => authorize);

const { setupDockerStatsMonitoringSocketServer } = await import(
	"@/server/wss/docker-stats"
);

const httpServer = new EventEmitter();
setupDockerStatsMonitoringSocketServer(httpServer as never);

const PATH = "/listen-docker-stats-monitoring";

const connect = async (query: Record<string, string>) => {
	const ws = { close: vi.fn(), send: vi.fn(), on: vi.fn() };
	const listener = wss.connections[PATH];
	if (!listener) throw new Error(`no connection listener for ${PATH}`);
	await listener(ws, {
		url: `${PATH}?${new URLSearchParams(query)}`,
		headers: { host: "localhost" },
	});
	await vi.advanceTimersByTimeAsync(1300);
	return ws;
};

const listedFilter = () => {
	const [options] = server.docker.listContainers.mock.calls[0] ?? [];
	return JSON.parse(options.filters);
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	server.validateRequest.mockResolvedValue({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	});
	server.docker.listContainers.mockResolvedValue([]);
	server.execAsync.mockRejectedValue(new Error("not a swarm service"));
});

afterEach(() => {
	vi.useRealTimers();
});

describe("docker stats of a session bound by serviceId", () => {
	it("lists only the containers of the bound compose project", async () => {
		authorize.resolveDockerStatsOverWss.mockResolvedValue({
			serviceAppName: "proj-abc123",
		});
		await connect({
			appName: "proj-abc123",
			appType: "docker-compose",
			serviceId: "compose-1",
		});
		expect(authorize.resolveDockerStatsOverWss).toHaveBeenCalledWith(
			{ id: "user-1" },
			{ activeOrganizationId: "org-1" },
			"compose-1",
			{ type: "stats", appName: "proj-abc123", appType: "docker-compose" },
		);
		expect(listedFilter()).toEqual({
			status: ["running"],
			label: ["com.docker.compose.project=proj-abc123"],
			name: ["proj-abc123"],
		});
	});

	it("lists only the containers of the bound stack namespace", async () => {
		authorize.resolveDockerStatsOverWss.mockResolvedValue({
			serviceAppName: "ns",
		});
		await connect({
			appName: "ns_web.1.task-1",
			appType: "stack",
			serviceId: "compose-1",
		});
		expect(listedFilter()).toEqual({
			status: ["running"],
			label: [
				"com.docker.swarm.task.name=ns_web.1.task-1",
				"com.docker.stack.namespace=ns",
			],
		});
	});

	it("does not stream a container that only the name filter would match", async () => {
		authorize.resolveDockerStatsOverWss.mockResolvedValue({
			serviceAppName: "proj",
		});
		server.docker.listContainers.mockImplementation(
			async ({ filters }: { filters: string }) => {
				const { label } = JSON.parse(filters);
				const containers: {
					Id: string;
					State: string;
					Labels: Record<string, string>;
				}[] = [
					{
						Id: "other",
						State: "running",
						Labels: { "com.docker.compose.project": "proj-other" },
					},
				];
				return containers.filter((container) =>
					(label ?? []).every((entry: string) => {
						const [key, value] = entry.split("=");
						return container.Labels[key as string] === value;
					}),
				);
			},
		);
		const ws = await connect({
			appName: "proj",
			appType: "docker-compose",
			serviceId: "compose-1",
		});
		expect(ws.close).toHaveBeenCalledWith(4000, "Container not running");
		expect(server.execAsync).not.toHaveBeenCalledWith(
			expect.stringContaining("docker stats"),
		);
	});
});

describe("docker stats without a service", () => {
	beforeEach(() => {
		authorize.resolveDockerStatsOverWss.mockResolvedValue({
			serviceAppName: null,
		});
	});

	it("keeps the name filter for a compose container", async () => {
		await connect({
			appName: "proj-abc123-web-1",
			appType: "docker-compose",
		});
		expect(listedFilter()).toEqual({
			status: ["running"],
			name: ["proj-abc123-web-1"],
		});
	});

	it("keeps the task name filter for a stack container", async () => {
		await connect({ appName: "ns_web.1.task-1", appType: "stack" });
		expect(listedFilter()).toEqual({
			status: ["running"],
			label: ["com.docker.swarm.task.name=ns_web.1.task-1"],
		});
	});
});

it("closes a refused request without listing containers", async () => {
	authorize.resolveDockerStatsOverWss.mockResolvedValue(null);
	const ws = await connect({
		appName: "proj",
		appType: "docker-compose",
		serviceId: "compose-1",
	});
	expect(ws.close).toHaveBeenCalledWith(4003, "Not authorized");
	expect(server.docker.listContainers).not.toHaveBeenCalled();
});
