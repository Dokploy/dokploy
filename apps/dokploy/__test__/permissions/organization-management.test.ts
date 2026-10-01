import { describe, expect, it, vi } from "vitest";

// Mock audit and db primitives
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const mockDb = {
	query: {
		organization: {
			findFirst: vi.fn(async ({ where }: any) => ({
				id: "org-active-1",
				name: "Active Org",
				ownerId: "user-owner-1",
			})),
		},
		member: {
			findFirst: vi.fn(async ({ where }: any) => ({
				id: "member-2",
				userId: "user-target-2",
				organizationId: "org-active-1",
				role: "member",
			})),
		},
	},
	transaction: vi.fn(async (cb: any) => {
		const tx = {
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(async () => []),
				})),
			})),
		};
		return await cb(tx);
	}),
	update: vi.fn(() => ({
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => [{ id: "member-2", teamId: "team-eng-1" }]),
			})),
		})),
	})),
	delete: vi.fn(() => ({
		where: vi.fn(() => ({
			returning: vi.fn(async () => [{ id: "inv-1" }, { id: "inv-2" }]),
		})),
	})),
};

vi.mock("@dokploy/server/db", () => ({
	db: mockDb,
}));

describe("Organization & Teams Management Router Actions (Issue #1413)", () => {
	it("executes atomic ownership transfer within active organization", async () => {
		const { organizationRouter } = await import(
			"@/server/api/routers/organization"
		);

		const caller = organizationRouter.createCaller({
			session: { activeOrganizationId: "org-active-1" },
			user: { id: "user-owner-1", role: "owner", email: "owner@test.com" },
		} as any);

		const result = await caller.transferOwnership({
			organizationId: "org-active-1",
			newOwnerMemberId: "member-2",
		});

		expect(result).toEqual({ success: true });
		expect(mockDb.transaction).toHaveBeenCalled();
	});

	it("rejects ownership transfer if targeted organization is not active", async () => {
		const { organizationRouter } = await import(
			"@/server/api/routers/organization"
		);

		const caller = organizationRouter.createCaller({
			session: { activeOrganizationId: "org-active-1" },
			user: { id: "user-owner-1", role: "owner", email: "owner@test.com" },
		} as any);

		await expect(
			caller.transferOwnership({
				organizationId: "org-other-2",
				newOwnerMemberId: "member-2",
			}),
		).rejects.toThrow("You can only transfer ownership of your currently active organization");
	});

	it("deletes expired and canceled invitations for active organization", async () => {
		const { organizationRouter } = await import(
			"@/server/api/routers/organization"
		);

		const caller = organizationRouter.createCaller({
			session: { activeOrganizationId: "org-active-1" },
			user: { id: "user-owner-1", role: "owner", email: "owner@test.com" },
		} as any);

		const result = await caller.deleteExpiredInvitations();
		expect(result).toEqual({ deletedCount: 2 });
		expect(mockDb.delete).toHaveBeenCalled();
	});

	it("updates member team assignment when caller belongs to active organization", async () => {
		const { organizationRouter } = await import(
			"@/server/api/routers/organization"
		);

		const caller = organizationRouter.createCaller({
			session: { activeOrganizationId: "org-active-1" },
			user: { id: "user-owner-1", role: "owner", email: "owner@test.com" },
		} as any);

		const result = await caller.updateMemberTeam({
			memberId: "member-2",
			teamId: "team-eng-1",
		});

		expect(result).toEqual({ id: "member-2", teamId: "team-eng-1" });
	});
});
