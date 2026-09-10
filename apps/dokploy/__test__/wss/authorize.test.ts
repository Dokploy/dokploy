import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the permission + server helpers the wss authorizer composes.
const mockHasPermission = vi.hoisted(() => vi.fn());
const mockFindMember = vi.hoisted(() => vi.fn());
const mockCheckServiceAccess = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/permission", () => ({
	hasPermission: mockHasPermission,
	findMemberByUserId: mockFindMember,
	checkServiceAccess: mockCheckServiceAccess,
}));

const mockGetAccessibleServerIds = vi.hoisted(() => vi.fn());
const mockFindServer = vi.hoisted(() => vi.fn());
const mockFindService = vi.hoisted(() => vi.fn());
const mockExec = vi.hoisted(() => vi.fn());
const mockExecRemote = vi.hoisted(() => vi.fn());
const deployment = vi.hoisted(() => ({ cloud: false }));
vi.mock("@/server/wss/service-resource", () => ({
	findWssService: mockFindService,
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mockExec,
	execAsyncRemote: mockExecRemote,
}));
vi.mock("@dokploy/server", () => ({
	getAccessibleServerIds: mockGetAccessibleServerIds,
	findServerById: mockFindServer,
	get IS_CLOUD() {
		return deployment.cloud;
	},
}));

import {
	authorizeDockerOverWss,
	canAccessDockerOverWss,
	canAccessTerminalOverWss,
} from "@/server/wss/authorize";

const USER = { id: "user-1" };
const SESSION = { activeOrganizationId: "org-1" };

beforeEach(() => {
	vi.resetAllMocks();
	deployment.cloud = false;
	mockHasPermission.mockResolvedValue(true);
	mockFindMember.mockResolvedValue({ role: "member" });
	mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
	mockFindServer.mockResolvedValue({ organizationId: "org-1" });
	mockFindService.mockResolvedValue({
		appName: "my-app",
		serverId: null,
		appType: "application",
	});
	mockExec.mockResolvedValue({
		stdout: JSON.stringify([
			{
				Id: "a".repeat(64),
				Config: { Labels: { "com.docker.swarm.service.name": "my-app" } },
			},
		]),
	});
	mockExecRemote.mockImplementation((...args) => mockExec(...args));
});

describe("canAccessDockerOverWss", () => {
	it("denies when there is no user or session", async () => {
		expect(await canAccessDockerOverWss(null, SESSION)).toBe(false);
		expect(await canAccessDockerOverWss(USER, null)).toBe(false);
	});

	it("denies a member without docker permission", async () => {
		mockHasPermission.mockResolvedValue(false);
		expect(
			await canAccessDockerOverWss(USER, SESSION, "srv-1", null, {
				containerId: "my-container",
			}),
		).toBe(false);
	});

	it("denies requests that omit the target", async () => {
		expect(await canAccessDockerOverWss(USER, SESSION)).toBe(false);
	});

	it("denies a remote server the caller cannot access, even with docker permission", async () => {
		mockHasPermission.mockResolvedValue(true);
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["other-server"]));
		expect(
			await canAccessDockerOverWss(USER, SESSION, "srv-1", null, {
				containerId: "my-container",
			}),
		).toBe(false);
	});

	it("allows a remote server the caller can access", async () => {
		mockHasPermission.mockResolvedValue(true);
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		expect(
			await canAccessDockerOverWss(USER, SESSION, "srv-1", null, {
				containerId: "my-container",
			}),
		).toBe(true);
	});

	it("denies when the container belongs to a service the caller cannot access", async () => {
		mockCheckServiceAccess.mockRejectedValue(new Error("no access"));
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "my-container",
			}),
		).toBe(false);
	});

	it("denies service access without Docker permission", async () => {
		mockHasPermission.mockResolvedValue(false);
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "my-container",
			}),
		).toBe(false);
		expect(mockHasPermission).toHaveBeenCalled();
		expect(mockExec).not.toHaveBeenCalled();
	});

	const access = (
		serverId: string | null = null,
		serviceId: string | null = "svc-1",
	) =>
		canAccessDockerOverWss(USER, SESSION, serverId, serviceId, {
			containerId: "my-container",
		});
	const stats = (appName: string, appType = "application") =>
		canAccessDockerOverWss(USER, SESSION, null, "svc-1", { appName, appType });

	it("denies local resources in cloud mode, including for administrators", async () => {
		deployment.cloud = true;
		mockFindMember.mockResolvedValue({ role: "admin" });
		expect(await access()).toBe(false);
		expect(await access(null, null)).toBe(false);
		expect(mockExec).not.toHaveBeenCalled();
	});
	it("rejects the local alias and command injection before inspection", async () => {
		expect(await access("local")).toBe(false);
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "my-container;id",
			}),
		).toBe(false);
		expect(mockExec).not.toHaveBeenCalled();
	});
	it("restricts host statistics to administrators without service context", async () => {
		const target = { appName: "dokploy", appType: "application" };
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, null, target),
		).toBe(false);
		mockFindMember.mockResolvedValue({ role: "admin" });
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, null, target),
		).toBe(true);
		expect(await stats("dokploy")).toBe(false);
	});

	it("allows a matching service container and returns its immutable ID", async () => {
		expect(await access()).toBe(true);
		expect(
			await authorizeDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "my-container",
			}),
		).toEqual({ containerId: "a".repeat(64) });
		expect(mockFindService).toHaveBeenCalledWith("svc-1", "org-1");
	});
	it("denies inaccessible services", async () => {
		mockCheckServiceAccess.mockRejectedValue(new Error("denied"));
		expect(await access()).toBe(false);
		expect(mockExec).not.toHaveBeenCalled();
	});
	it("denies missing or foreign organization services", async () => {
		mockFindService.mockResolvedValue(null);
		expect(await access()).toBe(false);
	});
	it("denies a service on an inaccessible server", async () => {
		mockGetAccessibleServerIds.mockResolvedValue(new Set());
		expect(await access("srv-1")).toBe(false);
		expect(mockExecRemote).not.toHaveBeenCalled();
	});
	it("denies a different accessible deployment server", async () => {
		expect(await access("srv-1")).toBe(false);
	});
	it("denies an omitted remote server ID", async () => {
		mockFindService.mockResolvedValue({
			appName: "my-app",
			serverId: "srv-1",
			appType: "application",
		});
		expect(await access()).toBe(false);
		expect(await access("srv-1")).toBe(true);
		expect(mockExecRemote).toHaveBeenCalled();
	});
	it("denies foreign organization servers even if in the accessible set", async () => {
		mockFindServer.mockResolvedValue({ organizationId: "org-2" });
		expect(await access("srv-1", null)).toBe(false);
	});
	it.each(["other-app", "dokploy", "dokploy-postgres", "my-app-extra"])(
		"denies unrelated container %s",
		async (appName) => {
			mockExec.mockResolvedValue({
				stdout: JSON.stringify([
					{
						Id: "b".repeat(64),
						Config: { Labels: { "com.docker.swarm.service.name": appName } },
					},
				]),
			});
			expect(await access()).toBe(false);
		},
	);
	it("denies unlabelled containers and inspect failures", async () => {
		mockExec.mockResolvedValue({
			stdout: JSON.stringify([{ Id: "b".repeat(64) }]),
		});
		expect(await access()).toBe(false);
		mockExec.mockRejectedValue(new Error("unavailable"));
		expect(await access()).toBe(false);
	});
	it("denies local generic Docker access to members, allows administrators", async () => {
		expect(await access(null, null)).toBe(false);
		mockFindMember.mockResolvedValue({ role: "admin" });
		expect(await access(null, null)).toBe(true);
	});
	it("binds monitoring to the service app name and type", async () => {
		expect(await stats("my-app")).toBe(true);
		expect(await stats("other-app")).toBe(false);
		expect(await stats("dokploy")).toBe(false);
		expect(await stats("my-app", "invalid")).toBe(false);
		expect(await stats("my-app", "stack")).toBe(false);
	});
	it.each(["stack", "docker-compose"])(
		"binds %s monitoring to Docker ownership labels",
		async (appType) => {
			mockFindService.mockResolvedValue({
				appName: "my-app",
				serverId: null,
				appType,
			});
			const label =
				appType === "stack"
					? "com.docker.stack.namespace"
					: "com.docker.compose.project";
			mockExec.mockResolvedValue({
				stdout: JSON.stringify([
					{ Id: "c".repeat(64), Config: { Labels: { [label]: "my-app" } } },
				]),
			});
			expect(await stats("custom-container-name", appType)).toBe(true);
			mockExec.mockResolvedValue({
				stdout: JSON.stringify([
					{
						Id: "c".repeat(64),
						Config: { Labels: { [label]: "my-app-extra" } },
					},
				]),
			});
			expect(await stats("custom-container-name", appType)).toBe(false);
		},
	);
	it("checks Swarm service logs using service metadata", async () => {
		mockExec.mockResolvedValue({
			stdout: JSON.stringify([{ ID: "swarm-id", Spec: { Name: "my-app" } }]),
		});
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "my-app",
				runType: "swarm",
			}),
		).toBe(true);
		mockExec.mockResolvedValue({
			stdout: JSON.stringify([{ ID: "swarm-id", Spec: { Name: "dokploy" } }]),
		});
		expect(
			await canAccessDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "dokploy",
				runType: "swarm",
			}),
		).toBe(false);
	});
	it("resolves Swarm task ownership and retains the task ID for logs", async () => {
		mockExec.mockResolvedValueOnce({
			stdout: JSON.stringify([{ ID: "task-id", ServiceID: "service-id" }]),
		});
		mockExec.mockResolvedValueOnce({
			stdout: JSON.stringify([{ ID: "service-id", Spec: { Name: "my-app" } }]),
		});
		expect(
			await authorizeDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "task-id",
				runType: "swarm",
			}),
		).toEqual({ containerId: "task-id" });
		mockExec.mockResolvedValueOnce({
			stdout: JSON.stringify([{ ID: "task-id", ServiceID: "foreign-service" }]),
		});
		mockExec.mockResolvedValueOnce({
			stdout: JSON.stringify([
				{ ID: "foreign-service", Spec: { Name: "other-app" } },
			]),
		});
		expect(
			await authorizeDockerOverWss(USER, SESSION, null, "svc-1", {
				containerId: "task-id",
				runType: "swarm",
			}),
		).toBeNull();
	});
});

describe("canAccessTerminalOverWss", () => {
	it("denies the local host terminal to a plain member", async () => {
		mockFindMember.mockResolvedValue({ role: "member" });
		expect(await canAccessTerminalOverWss(USER, SESSION, "local")).toBe(false);
	});

	it("allows the local host terminal to an owner", async () => {
		mockFindMember.mockResolvedValue({ role: "owner" });
		expect(await canAccessTerminalOverWss(USER, SESSION, "local")).toBe(true);
	});

	it("allows the local host terminal to an admin", async () => {
		mockFindMember.mockResolvedValue({ role: "admin" });
		expect(await canAccessTerminalOverWss(USER, SESSION, "local")).toBe(true);
	});

	it("gates a remote server terminal on server access", async () => {
		mockHasPermission.mockResolvedValue(true);
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-1")).toBe(true);
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-2")).toBe(false);
		// the remote path must never fall through to the owner/admin local branch
		expect(mockFindMember).not.toHaveBeenCalled();
	});

	it("denies a remote server terminal without the server.terminal permission", async () => {
		// Reaching a server (to deploy on it) must not imply a root shell on it.
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		mockHasPermission.mockResolvedValue(false);
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-1")).toBe(false);
		expect(mockHasPermission).toHaveBeenCalledWith(
			{ user: { id: USER.id }, session: { activeOrganizationId: "org-1" } },
			{ server: ["terminal"] },
		);
	});

	it("allows a remote server terminal with the server.terminal permission", async () => {
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		mockHasPermission.mockResolvedValue(true);
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-1")).toBe(true);
	});

	it("does not check permissions for a server the caller cannot access", async () => {
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		mockHasPermission.mockResolvedValue(true);
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-2")).toBe(false);
		expect(mockHasPermission).not.toHaveBeenCalled();
	});
});
