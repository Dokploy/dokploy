import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({
	assertLocalDockerContainerAccess: vi.fn(),
	assertLocalDockerServiceAccess: vi.fn(),
	checkPermission: vi.fn(),
	findMemberByUserId: vi.fn(),
	findServerById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	spawn: vi.fn(),
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findServerById: mocks.findServerById,
	validateRequest: mocks.validateRequest,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	findMemberByUserId: mocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAccessibleServerIds: mocks.getAccessibleServerIds,
}));

vi.mock("@/server/api/utils/local-docker-access", () => ({
	assertLocalDockerContainerAccess: mocks.assertLocalDockerContainerAccess,
	assertLocalDockerServiceAccess: mocks.assertLocalDockerServiceAccess,
}));

vi.mock("node-pty", () => ({
	spawn: mocks.spawn,
}));

vi.mock("ssh2", () => ({
	Client: vi.fn(() => ({
		once: vi.fn().mockReturnThis(),
		on: vi.fn().mockReturnThis(),
		connect: vi.fn().mockReturnThis(),
		end: vi.fn(),
		exec: vi.fn(),
	})),
}));

const { setupDockerContainerLogsWebSocketServer } = await import(
	"../../server/wss/docker-container-logs"
);
const { setupDockerContainerTerminalWebSocketServer } = await import(
	"../../server/wss/docker-container-terminal"
);

const listen = async (server: http.Server) =>
	new Promise<number>((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			resolve((server.address() as AddressInfo).port);
		});
	});

const closeServer = async (server: http.Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

const openAndWaitForClose = async (port: number, path: string) =>
	new Promise<{ code: number; reason: string }>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error("WebSocket close timeout"));
		}, 2000);
		const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);

		ws.on("close", (code, reason) => {
			clearTimeout(timeout);
			resolve({ code, reason: reason.toString() });
		});
		ws.on("error", reject);
	});

describe("Docker WebSocket permission gate", () => {
	let server: http.Server | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateRequest.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		mocks.checkPermission.mockRejectedValue(new Error("Permission denied"));
		mocks.findMemberByUserId.mockResolvedValue({ role: "admin" });
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.assertLocalDockerContainerAccess.mockResolvedValue({
			Id: "container-1",
		});
	});

	afterEach(async () => {
		if (server?.listening) {
			await closeServer(server);
		}
		server = undefined;
	});

	it("closes logs sockets before remote server lookup when docker.read is denied", async () => {
		server = http.createServer();
		setupDockerContainerLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-logs?containerId=abc123def456&serverId=server-1",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			{ docker: ["read"] },
		);
		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("closes logs sockets before remote server lookup when server is not assigned", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		server = http.createServer();
		setupDockerContainerLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-logs?containerId=abc123def456&serverId=server-1",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith({
			userId: "user-1",
			activeOrganizationId: "org-1",
		});
		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("closes terminal sockets before local Docker spawn when docker.execute is denied", async () => {
		server = http.createServer();
		setupDockerContainerTerminalWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-terminal?containerId=abc123def456",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.checkPermission).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			{ docker: ["execute"] },
		);
		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("closes local logs sockets before Docker spawn when container binding fails", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertLocalDockerContainerAccess.mockRejectedValue(
			new Error("not bound"),
		);
		server = http.createServer();
		setupDockerContainerLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-logs?containerId=abc123def456",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("closes local terminal sockets before Docker spawn when container binding fails", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertLocalDockerContainerAccess.mockRejectedValue(
			new Error("not bound"),
		);
		server = http.createServer();
		setupDockerContainerTerminalWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-terminal?containerId=abc123def456",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("closes terminal sockets before remote server lookup when server is not assigned", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));
		server = http.createServer();
		setupDockerContainerTerminalWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				"/docker-container-terminal?containerId=abc123def456&serverId=server-1",
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith({
			userId: "user-1",
			activeOrganizationId: "org-1",
		});
		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
});
