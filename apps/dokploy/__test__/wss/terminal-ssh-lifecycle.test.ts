import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const clients = vi.hoisted(() => [] as FakeClient[]);
const lookupDelay = vi.hoisted(() => ({ ms: 0 }));

interface FakeClient extends EventEmitter {
	connect: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
	shell: ReturnType<typeof vi.fn>;
	exec: ReturnType<typeof vi.fn>;
}

vi.mock("ssh2", async () => {
	const { EventEmitter } = await import("node:events");
	class Client extends EventEmitter {
		connect = vi.fn(() => this);
		destroy = vi.fn(() => this);
		end = vi.fn(() => this);
		shell = vi.fn();
		exec = vi.fn();
		constructor() {
			super();
			clients.push(this as unknown as FakeClient);
		}
	}
	return { Client };
});
vi.mock("node-pty", () => ({ spawn: vi.fn() }));
vi.mock("public-ip", () => ({ publicIpv4: vi.fn(), publicIpv6: vi.fn() }));
vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	execAsync: vi.fn(async () => ({ stdout: "", stderr: "" })),
	paths: vi.fn(() => ({ SSH_PATH: "/tmp" })),
	validateRequest: vi.fn(async () => ({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	})),
	findServerById: vi.fn(async () => {
		await new Promise((r) => setTimeout(r, lookupDelay.ms));
		return {
			organizationId: "org-1",
			ipAddress: "10.0.0.1",
			port: 22,
			username: "root",
			sshKeyId: "key-1",
			sshKey: { privateKey: "key" },
		};
	}),
}));
vi.mock("@/server/wss/authorize", () => ({
	canAccessTerminalOverWss: vi.fn(async () => true),
	canAccessDockerOverWss: vi.fn(async () => true),
}));
vi.mock("@/server/wss/container-ownership", () => ({
	containerBelongsToService: vi.fn(async () => true),
}));

import { setupDockerContainerTerminalWebSocketServer } from "@/server/wss/docker-container-terminal";
import { setupTerminalWebSocketServer } from "@/server/wss/terminal";

const terminals = {
	server: {
		path: "/terminal?serverId=srv-1",
		openChannel: (c: FakeClient) => c.shell,
	},
	container: {
		path: "/docker-container-terminal?containerId=abc123&serverId=srv-1",
		openChannel: (c: FakeClient) => c.exec,
	},
} as const;

let server: http.Server;
let base: string;

beforeEach(async () => {
	clients.length = 0;
	lookupDelay.ms = 0;
	server = http.createServer();
	setupTerminalWebSocketServer(server);
	setupDockerContainerTerminalWebSocketServer(server);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
	await new Promise((r) => server.close(r));
});

const connect = async (path: string) => {
	const ws = new WebSocket(`${base}${path}`);
	ws.on("error", () => {});
	await new Promise((r) => ws.once("open", r));
	return ws;
};

const fakeStream = () =>
	Object.assign(new EventEmitter(), {
		stderr: new EventEmitter(),
		write: vi.fn(),
		setWindow: vi.fn(),
		end: vi.fn(),
	});

const openShell = async (
	t: (typeof terminals)[keyof typeof terminals],
	error?: Error,
) => {
	const ws = await connect(t.path);
	await vi.waitFor(() => expect(clients[0]?.connect).toHaveBeenCalled());
	const client = clients[0] as FakeClient;
	client.emit("ready");
	const stream = fakeStream();
	t.openChannel(client).mock.calls[0]?.at(-1)(
		error,
		error ? undefined : stream,
	);
	return { ws, client, stream };
};

describe.each(Object.entries(terminals))("%s terminal over SSH", (_, t) => {
	it("destroys a pending connection when the browser closes mid-handshake", async () => {
		const ws = await connect(t.path);
		await vi.waitFor(() => expect(clients[0]?.connect).toHaveBeenCalled());

		ws.close();

		await vi.waitFor(() => expect(clients[0]?.destroy).toHaveBeenCalled());
		expect(t.openChannel(clients[0] as FakeClient)).not.toHaveBeenCalled();
	});

	it("never connects when the browser leaves during the server lookup", async () => {
		lookupDelay.ms = 200;
		const ws = await connect(t.path);
		ws.close();

		await new Promise((r) => setTimeout(r, 400));
		expect(clients).toHaveLength(0);
	});

	it("destroys the connection when the browser closes an open shell", async () => {
		const { ws, client } = await openShell(t);

		ws.close();

		await vi.waitFor(() =>
			expect(
				client.destroy.mock.calls.length + client.end.mock.calls.length,
			).toBeGreaterThan(0),
		);
	});

	it("closes the socket and the connection when the remote shell exits", async () => {
		const { ws, client, stream } = await openShell(t);

		stream.emit("close", 0);

		await vi.waitFor(() => expect(ws.readyState).toBe(WebSocket.CLOSED));
		expect(client.end).toHaveBeenCalled();
	});

	it("closes the socket and the connection when the shell cannot be opened", async () => {
		const { ws, client } = await openShell(
			t,
			new Error("channel open failure"),
		);

		await vi.waitFor(() => expect(ws.readyState).toBe(WebSocket.CLOSED));
		expect(client.end).toHaveBeenCalled();
	});
});
