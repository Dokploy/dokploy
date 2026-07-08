import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMemberByUserId: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: mocks.findMemberByUserId,
}));

const { assertLocalHostAccess } = await import(
	"../../server/api/utils/local-host-access"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

describe("local host access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("allows organization owners and admins", async () => {
		mocks.findMemberByUserId.mockResolvedValueOnce({ role: "owner" });
		await expect(assertLocalHostAccess(ctx)).resolves.toBeUndefined();

		mocks.findMemberByUserId.mockResolvedValueOnce({ role: "admin" });
		await expect(assertLocalHostAccess(ctx)).resolves.toBeUndefined();
	});

	it("rejects members and custom roles before local host operations", async () => {
		mocks.findMemberByUserId.mockResolvedValue({ role: "server-operator" });

		await expect(assertLocalHostAccess(ctx)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("rejects missing membership before local host operations", async () => {
		mocks.findMemberByUserId.mockResolvedValue(null);

		await expect(assertLocalHostAccess(ctx)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
