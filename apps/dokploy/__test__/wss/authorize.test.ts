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
vi.mock("@dokploy/server", () => ({
	getAccessibleServerIds: mockGetAccessibleServerIds,
}));

import {
	canAccessDockerOverWss,
	canAccessTerminalOverWss,
} from "@/server/wss/authorize";

const USER = { id: "user-1" };
const SESSION = { activeOrganizationId: "org-1" };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("canAccessDockerOverWss", () => {
	it("denies when there is no user or session", async () => {
		expect(await canAccessDockerOverWss(null, SESSION)).toBe(false);
		expect(await canAccessDockerOverWss(USER, null)).toBe(false);
	});

	it("denies a member without docker permission", async () => {
		mockHasPermission.mockResolvedValue(false);
		expect(await canAccessDockerOverWss(USER, SESSION)).toBe(false);
	});

	it("allows when the caller has docker permission (no server)", async () => {
		mockHasPermission.mockResolvedValue(true);
		expect(await canAccessDockerOverWss(USER, SESSION)).toBe(true);
	});

	it("denies a remote server the caller cannot access, even with docker permission", async () => {
		mockHasPermission.mockResolvedValue(true);
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["other-server"]));
		expect(await canAccessDockerOverWss(USER, SESSION, "srv-1")).toBe(false);
	});

	it("allows a remote server the caller can access", async () => {
		mockHasPermission.mockResolvedValue(true);
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		expect(await canAccessDockerOverWss(USER, SESSION, "srv-1")).toBe(true);
	});

	it("denies when the container belongs to a service the caller cannot access", async () => {
		mockCheckServiceAccess.mockRejectedValue(new Error("no access"));
		expect(await canAccessDockerOverWss(USER, SESSION, null, "svc-1")).toBe(
			false,
		);
	});

	it("allows service access even without docker permission or server access", async () => {
		// A member granted the service but without canAccessToDocker, whose
		// service runs on a server they were not individually granted, must still
		// read its logs — matches application.readLogs (service access only).
		mockHasPermission.mockResolvedValue(false);
		mockGetAccessibleServerIds.mockResolvedValue(new Set());
		mockCheckServiceAccess.mockResolvedValue(undefined);
		expect(
			await canAccessDockerOverWss(USER, SESSION, "srv-remote", "svc-1"),
		).toBe(true);
		// Service path is authoritative — it must not fall through to docker/server.
		expect(mockHasPermission).not.toHaveBeenCalled();
		expect(mockGetAccessibleServerIds).not.toHaveBeenCalled();
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
		mockGetAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-1")).toBe(true);
		expect(await canAccessTerminalOverWss(USER, SESSION, "srv-2")).toBe(false);
		// role lookup must not be needed for the remote path
		expect(mockFindMember).not.toHaveBeenCalled();
	});
});
