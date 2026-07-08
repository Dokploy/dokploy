import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

const BASE = "/base";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	findDeploymentById: vi.fn(),
	findServerById: vi.fn(),
	spawn: vi.fn(),
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	findDeploymentById: mocks.findDeploymentById,
	findServerById: mocks.findServerById,
	validateRequest: mocks.validateRequest,
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: () => ({
			...actual.paths(),
			BASE_PATH: BASE,
			LOGS_PATH: `${BASE}/logs`,
			APPLICATIONS_PATH: `${BASE}/applications`,
			SCHEDULES_PATH: `${BASE}/schedules`,
			VOLUME_BACKUPS_PATH: `${BASE}/volume-backups`,
		}),
	};
});

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
}));

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: mocks.spawn,
	};
});

vi.mock("ssh2", () => ({
	Client: vi.fn(() => ({
		on: vi.fn().mockReturnThis(),
		connect: vi.fn().mockReturnThis(),
		end: vi.fn(),
		exec: vi.fn(),
	})),
}));

const { setupDeploymentLogsWebSocketServer } = await import(
	"../../server/wss/listen-deployment"
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

const createTailProcess = () => {
	const tailProcess = {
		killed: false,
		kill: vi.fn(),
		on: vi.fn((event: string, callback: () => void) => {
			if (event === "close") {
				setTimeout(callback, 0);
			}
			return tailProcess;
		}),
		stderr: new EventEmitter(),
		stdout: new EventEmitter(),
	};
	return tailProcess;
};

describe("deployment log WebSocket boundary", () => {
	let server: http.Server | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateRequest.mockResolvedValue({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findDeploymentById.mockResolvedValue({
			applicationId: "app-1",
			composeId: null,
			deploymentId: "deployment-1",
			logPath: `${BASE}/logs/app/app-2026-06-22.log`,
			scheduleId: null,
			schedule: null,
			serverId: null,
			volumeBackupId: null,
		});
		mocks.spawn.mockReturnValue(createTailProcess());
	});

	afterEach(async () => {
		if (server?.listening) {
			await closeServer(server);
		}
		server = undefined;
	});

	it("rejects caller-supplied log paths without a deployment id", async () => {
		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?logPath=${encodeURIComponent(`${BASE}/logs/app/app-2026-06-22.log`)}`,
			),
		).resolves.toEqual({ code: 4000, reason: "deploymentId required" });

		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("requires deployment read access before tailing a deployment log", async () => {
		mocks.checkServicePermissionAndAccess.mockRejectedValue(
			new Error("Permission denied"),
		);

		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=deployment-1&logPath=${encodeURIComponent(`${BASE}/logs/app/app-2026-06-22.log`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			"app-1",
			{ deployment: ["read"] },
		);
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("tails the authorized deployment record log path instead of caller logPath", async () => {
		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=deployment-1&logPath=${encodeURIComponent(`${BASE}/applications/app/code/.env`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			"app-1",
			{ deployment: ["read"] },
		);
		expect(mocks.spawn).toHaveBeenCalledWith("tail", [
			"-n",
			"+1",
			"-f",
			`${BASE}/logs/app/app-2026-06-22.log`,
		]);
	});

	it("ignores caller-supplied server ids for deployment rows without server binding", async () => {
		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=deployment-1&serverId=foreign-server&logPath=${encodeURIComponent(`${BASE}/applications/app/code/.env`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.findServerById).not.toHaveBeenCalled();
		expect(mocks.spawn).toHaveBeenCalledWith("tail", [
			"-n",
			"+1",
			"-f",
			`${BASE}/logs/app/app-2026-06-22.log`,
		]);
	});

	it("tails authorized schedule deployment logs from the schedules root", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			applicationId: null,
			composeId: null,
			deploymentId: "schedule-deployment-1",
			logPath: `${BASE}/schedules/schedule-app/schedule-app-2026-06-22.log`,
			scheduleId: "schedule-1",
			schedule: {
				applicationId: "app-1",
				serverId: null,
			},
			serverId: null,
			volumeBackupId: null,
		});

		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=schedule-deployment-1&logPath=${encodeURIComponent(`${BASE}/applications/app/code/.env`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.spawn).toHaveBeenCalledWith("tail", [
			"-n",
			"+1",
			"-f",
			`${BASE}/schedules/schedule-app/schedule-app-2026-06-22.log`,
		]);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			"app-1",
			{ deployment: ["read"] },
		);
	});

	it("tails authorized volume backup deployment logs from the volume backups root", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			applicationId: null,
			composeId: null,
			deploymentId: "volume-backup-deployment-1",
			logPath: `${BASE}/volume-backups/volume-app/volume-app-2026-06-22.log`,
			scheduleId: null,
			schedule: null,
			serverId: null,
			volumeBackupId: "volume-backup-1",
			volumeBackup: {
				applicationId: "app-1",
			},
		});

		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=volume-backup-deployment-1&logPath=${encodeURIComponent(`${BASE}/applications/app/code/.env`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.spawn).toHaveBeenCalledWith("tail", [
			"-n",
			"+1",
			"-f",
			`${BASE}/volume-backups/volume-app/volume-app-2026-06-22.log`,
		]);
		expect(mocks.checkServicePermissionAndAccess).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			"app-1",
			{ deployment: ["read"] },
		);
	});

	it("uses volume backup service server binding instead of caller-supplied server ids", async () => {
		mocks.findDeploymentById.mockResolvedValue({
			applicationId: null,
			composeId: null,
			deploymentId: "volume-backup-deployment-1",
			logPath: `${BASE}/volume-backups/volume-app/volume-app-2026-06-22.log`,
			scheduleId: null,
			schedule: null,
			serverId: null,
			volumeBackupId: "volume-backup-1",
			volumeBackup: {
				applicationId: "app-1",
				application: {
					serverId: "allowed-server",
				},
			},
		});
		mocks.findServerById.mockResolvedValue({
			organizationId: "org-1",
			sshKeyId: null,
		});

		server = http.createServer();
		setupDeploymentLogsWebSocketServer(server);
		const port = await listen(server);

		await expect(
			openAndWaitForClose(
				port,
				`/listen-deployment?deploymentId=volume-backup-deployment-1&serverId=foreign-server&logPath=${encodeURIComponent(`${BASE}/applications/app/code/.env`)}`,
			),
		).resolves.toEqual({ code: 1005, reason: "" });

		expect(mocks.findServerById).toHaveBeenCalledWith("allowed-server");
		expect(mocks.findServerById).not.toHaveBeenCalledWith("foreign-server");
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
});
