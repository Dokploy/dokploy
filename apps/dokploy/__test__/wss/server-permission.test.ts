import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	assertLocalHostAccess: vi.fn(),
	checkPermission: vi.fn(),
	getAccessibleServerIds: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

vi.mock("@dokploy/server/services/server", () => ({
	getAccessibleServerIds: mocks.getAccessibleServerIds,
}));

vi.mock("@/server/api/utils/local-host-access", () => ({
	assertLocalHostAccess: mocks.assertLocalHostAccess,
}));

const { canAccessMonitoringWebSocket, canAccessServerTerminalWebSocket } =
	await import("../../server/wss/server-permission");

describe("canAccessServerTerminalWebSocket", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockReset();
		mocks.getAccessibleServerIds.mockReset();
		mocks.assertLocalHostAccess.mockResolvedValue(undefined);
	});

	it("rejects unauthenticated terminal websocket requests", async () => {
		await expect(
			canAccessServerTerminalWebSocket({
				user: null,
				session: null,
				serverId: "server-1",
			}),
		).resolves.toBe(false);

		expect(mocks.checkPermission).not.toHaveBeenCalled();
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("allows local terminal access only after local host access passes", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);

		await expect(
			canAccessServerTerminalWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
				serverId: "local",
			}),
		).resolves.toBe(true);

		expect(mocks.checkPermission).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			{ server: ["execute"] },
		);
		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
		expect(mocks.assertLocalHostAccess).toHaveBeenCalledWith({
			user: { id: "user-1" },
			session: { activeOrganizationId: "org-1" },
		});
	});

	it("rejects local terminal access when local host access is denied", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertLocalHostAccess.mockRejectedValue(new Error("denied"));

		await expect(
			canAccessServerTerminalWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
				serverId: "local",
			}),
		).resolves.toBe(false);

		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});

	it("allows remote terminal access only for accessible servers", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));

		await expect(
			canAccessServerTerminalWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
				serverId: "server-1",
			}),
		).resolves.toBe(true);

		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith({
			userId: "user-1",
			activeOrganizationId: "org-1",
		});
	});

	it("rejects remote terminal access for inaccessible servers", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			canAccessServerTerminalWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
				serverId: "server-1",
			}),
		).resolves.toBe(false);
	});

	it("rejects terminal access without server.execute permission", async () => {
		mocks.checkPermission.mockRejectedValue(new Error("Permission denied"));

		await expect(
			canAccessServerTerminalWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
				serverId: "server-1",
			}),
		).resolves.toBe(false);

		expect(mocks.getAccessibleServerIds).not.toHaveBeenCalled();
	});
});

describe("canAccessMonitoringWebSocket", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockReset();
		mocks.getAccessibleServerIds.mockReset();
	});

	it("rejects unauthenticated monitoring websocket requests", async () => {
		await expect(
			canAccessMonitoringWebSocket({
				user: null,
				session: null,
			}),
		).resolves.toBe(false);

		expect(mocks.checkPermission).not.toHaveBeenCalled();
	});

	it("allows callers with monitoring.read permission", async () => {
		mocks.checkPermission.mockResolvedValue(undefined);

		await expect(
			canAccessMonitoringWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			}),
		).resolves.toBe(true);

		expect(mocks.checkPermission).toHaveBeenCalledWith(
			{
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			},
			{ monitoring: ["read"] },
		);
	});

	it("rejects callers without monitoring.read permission", async () => {
		mocks.checkPermission.mockRejectedValue(new Error("Permission denied"));

		await expect(
			canAccessMonitoringWebSocket({
				user: { id: "user-1" },
				session: { activeOrganizationId: "org-1" },
			}),
		).resolves.toBe(false);
	});
});
