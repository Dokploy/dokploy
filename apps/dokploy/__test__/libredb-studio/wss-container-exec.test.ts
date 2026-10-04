import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SHORT_ID = "abc123def456";
const FULL_ID = "f".repeat(64);

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

const pty = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node-pty", () => pty);

const ssh = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("ssh2", () => ({
	Client: class {
		listeners: Record<string, () => void> = {};
		once(event: string, listener: () => void) {
			this.listeners[event] = listener;
			return this;
		}
		on() {
			return this;
		}
		connect() {
			this.listeners.ready?.();
			return this;
		}
		exec(command: string, ...rest: unknown[]) {
			ssh.exec(command, ...rest);
		}
		end() {}
	},
}));

const server = vi.hoisted(() => ({
	IS_CLOUD: false,
	findServerById: vi.fn(),
	validateRequest: vi.fn(),
}));
vi.mock("@dokploy/server", () => server);

const authorize = vi.hoisted(() => ({
	canAccessDockerOverWss: vi.fn(),
	resolveDockerContainerOverWss: vi.fn(),
}));
vi.mock("@/server/wss/authorize", () => authorize);

const { setupDockerContainerTerminalWebSocketServer } = await import(
	"@/server/wss/docker-container-terminal"
);
const { setupDockerContainerLogsWebSocketServer } = await import(
	"@/server/wss/docker-container-logs"
);

const httpServer = new EventEmitter();
setupDockerContainerTerminalWebSocketServer(httpServer as never);
setupDockerContainerLogsWebSocketServer(httpServer as never);

const fakeWs = () => ({
	OPEN: 1,
	readyState: 1,
	close: vi.fn(),
	send: vi.fn(),
	on: vi.fn(),
	ping: vi.fn(),
});

const connect = async (path: string, query: Record<string, string>) => {
	const ws = fakeWs();
	const listener = wss.connections[path];
	if (!listener) throw new Error(`no connection listener for ${path}`);
	await listener(ws, {
		url: `${path}?${new URLSearchParams(query)}`,
		headers: { host: "localhost" },
	});
	return ws;
};

beforeEach(() => {
	vi.clearAllMocks();
	server.validateRequest.mockResolvedValue({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	});
	server.findServerById.mockResolvedValue({
		organizationId: "org-1",
		sshKeyId: "key-1",
		ipAddress: "10.0.0.2",
		port: 22,
		username: "root",
		sshKey: { privateKey: "key" },
	});
	authorize.resolveDockerContainerOverWss.mockResolvedValue(FULL_ID);
	pty.spawn.mockReturnValue({
		onData: vi.fn(),
		onExit: vi.fn(),
		kill: vi.fn(),
	});
});

describe("container terminal", () => {
	it("runs docker exec on the container the authorization inspected", async () => {
		await connect("/docker-container-terminal", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
		});
		expect(authorize.resolveDockerContainerOverWss).toHaveBeenCalledWith(
			{ id: "user-1" },
			{ activeOrganizationId: "org-1" },
			null,
			"compose-1",
			{ type: "terminal", containerId: SHORT_ID },
		);
		expect(pty.spawn).toHaveBeenCalledWith(
			"docker",
			["exec", "-it", "-w", "/", FULL_ID, "sh"],
			expect.anything(),
		);
	});

	it("runs docker exec on the inspected container on a remote server", async () => {
		await connect("/docker-container-terminal", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
			serverId: "srv-1",
		});
		expect(ssh.exec).toHaveBeenCalledWith(
			`docker exec -it -w / ${FULL_ID} sh`,
			expect.anything(),
			expect.anything(),
		);
	});

	it("closes a refused request without running docker", async () => {
		authorize.resolveDockerContainerOverWss.mockResolvedValue(null);
		const ws = await connect("/docker-container-terminal", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
		});
		expect(ws.close).toHaveBeenCalledWith(4003, "Not authorized");
		expect(pty.spawn).not.toHaveBeenCalled();
	});
});

describe("container logs", () => {
	it("follows the logs of the container the authorization inspected", async () => {
		await connect("/docker-container-logs", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
			runType: "native",
		});
		expect(authorize.resolveDockerContainerOverWss).toHaveBeenCalledWith(
			{ id: "user-1" },
			{ activeOrganizationId: "org-1" },
			null,
			"compose-1",
			{ type: "logs", containerId: SHORT_ID, runType: "native" },
		);
		const [, args] = pty.spawn.mock.calls[0] ?? [];
		expect(args?.[1]).toMatch(new RegExp(`--follow ${FULL_ID}$`));
	});

	it("follows the logs of the inspected container on a remote server", async () => {
		await connect("/docker-container-logs", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
			serverId: "srv-1",
			runType: "native",
		});
		const [command] = ssh.exec.mock.calls[0] ?? [];
		expect(command).toMatch(new RegExp(`--follow ${FULL_ID}$`));
	});

	it("closes a refused request without running docker", async () => {
		authorize.resolveDockerContainerOverWss.mockResolvedValue(null);
		const ws = await connect("/docker-container-logs", {
			containerId: SHORT_ID,
			serviceId: "compose-1",
			runType: "native",
		});
		expect(ws.close).toHaveBeenCalledWith(4003, "Not authorized");
		expect(pty.spawn).not.toHaveBeenCalled();
	});
});
