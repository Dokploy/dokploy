import { beforeEach, describe, expect, it, vi } from "vitest";

const permission = vi.hoisted(() => ({
	checkServiceAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
	hasPermission: vi.fn(),
	isLibreDBStudioApplication: vi.fn(),
}));
vi.mock("@dokploy/server/services/permission", () => permission);
vi.mock("@dokploy/server", () => ({ getAccessibleServerIds: vi.fn() }));

import { canOpenServiceTerminalOverWss } from "@/server/wss/authorize";

const USER = { id: "user-1" };
const SESSION = { activeOrganizationId: "org-1" };

beforeEach(() => {
	vi.clearAllMocks();
	permission.findMemberByUserId.mockResolvedValue({ role: "member" });
});

describe("canOpenServiceTerminalOverWss", () => {
	it("refuses the terminal of a LibreDB Studio to a member", async () => {
		permission.isLibreDBStudioApplication.mockResolvedValue(true);
		await expect(
			canOpenServiceTerminalOverWss(USER, SESSION, "app-1"),
		).resolves.toBe(false);
		expect(permission.isLibreDBStudioApplication).toHaveBeenCalledWith("app-1");
		expect(permission.findMemberByUserId).toHaveBeenCalledWith(
			"user-1",
			"org-1",
		);
	});

	it.each(["owner", "admin"])(
		"allows the terminal of a LibreDB Studio to an %s",
		async (role) => {
			permission.isLibreDBStudioApplication.mockResolvedValue(true);
			permission.findMemberByUserId.mockResolvedValue({ role });
			await expect(
				canOpenServiceTerminalOverWss(USER, SESSION, "app-1"),
			).resolves.toBe(true);
		},
	);

	it("allows a member the terminal of any other service", async () => {
		permission.isLibreDBStudioApplication.mockResolvedValue(false);
		await expect(
			canOpenServiceTerminalOverWss(USER, SESSION, "app-2"),
		).resolves.toBe(true);
		expect(permission.findMemberByUserId).not.toHaveBeenCalled();
	});

	it("leaves a terminal opened without a service to the docker checks", async () => {
		await expect(
			canOpenServiceTerminalOverWss(USER, SESSION, null),
		).resolves.toBe(true);
		expect(permission.isLibreDBStudioApplication).not.toHaveBeenCalled();
	});
});
