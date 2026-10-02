import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
	query: {
		member: {
			findFirst: vi.fn(),
		},
		organization: {
			findFirst: vi.fn(),
		},
		user: {
			findFirst: vi.fn(),
		},
	},
}));

vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

import { isAdminPresent } from "@dokploy/server/services/admin";

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.query.member.findFirst.mockResolvedValue(undefined);
	mockDb.query.organization.findFirst.mockResolvedValue(undefined);
	mockDb.query.user.findFirst.mockResolvedValue(undefined);
});

describe("isAdminPresent", () => {
	it("returns false on a truly uninitialized instance", async () => {
		await expect(isAdminPresent()).resolves.toBe(false);
	});

	it("returns true when an owner membership exists", async () => {
		mockDb.query.member.findFirst.mockResolvedValue({
			id: "member-1",
			role: "owner",
			userId: "user-1",
			organizationId: "org-1",
		});

		await expect(isAdminPresent()).resolves.toBe(true);
	});

	it("returns true when member.owner is missing but an organization owner exists", async () => {
		mockDb.query.organization.findFirst.mockResolvedValue({
			id: "org-1",
			ownerId: "user-1",
			owner: { id: "user-1", email: "admin@example.com" },
		});

		await expect(isAdminPresent()).resolves.toBe(true);
	});

	it("returns true when users exist even if owner membership and organizations are missing", async () => {
		mockDb.query.user.findFirst.mockResolvedValue({
			id: "user-1",
			email: "admin@example.com",
		});

		await expect(isAdminPresent()).resolves.toBe(true);
	});
});
