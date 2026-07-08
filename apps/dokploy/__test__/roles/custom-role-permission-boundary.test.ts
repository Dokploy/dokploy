import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkPermission: vi.fn(),
	memberCountGroupBy: vi.fn(),
	memberCountWhere: vi.fn(),
	membersWhere: vi.fn(),
	organizationRoleFindMany: vi.fn(),
	select: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organizationRole: {
				findMany: mocks.organizationRoleFindMany,
			},
		},
		select: mocks.select,
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
}));

const { customRoleRouter } = await import(
	"../../server/api/routers/proprietary/custom-role"
);

const createCaller = () =>
	customRoleRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role: "member",
		},
	} as never);

describe("custom role router permission boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.organizationRoleFindMany.mockResolvedValue([
			{
				id: "role-row-1",
				role: "deployer",
				permission: JSON.stringify({ service: ["read"] }),
				createdAt: new Date("2026-06-26T00:00:00.000Z"),
			},
		]);
		mocks.memberCountGroupBy.mockResolvedValue([
			{
				role: "deployer",
				count: 2,
			},
		]);
		mocks.membersWhere.mockResolvedValue([
			{
				id: "member-1",
				userId: "user-1",
				email: "user@example.com",
				firstName: "User",
				lastName: "One",
			},
		]);
		mocks.select.mockReturnValue({
			from: vi.fn(() => ({
				innerJoin: vi.fn(() => ({
					where: mocks.membersWhere,
				})),
				where: mocks.memberCountWhere.mockReturnValue({
					groupBy: mocks.memberCountGroupBy,
				}),
			})),
		});
	});

	it("requires member.read for custom role enumeration endpoints", async () => {
		const caller = createCaller();

		await expect(caller.all()).resolves.toEqual([
			expect.objectContaining({
				role: "deployer",
				permissions: { service: ["read"] },
				memberCount: 2,
			}),
		]);
		await expect(
			caller.membersByRole({ roleName: "deployer" }),
		).resolves.toHaveLength(1);
		await expect(caller.getStatements()).resolves.toHaveProperty("member");

		expect(
			mocks.checkPermission.mock.calls.filter(
				([, permissions]) =>
					JSON.stringify(permissions) === JSON.stringify({ member: ["read"] }),
			),
		).toHaveLength(3);
	});

	it("denies custom role enumeration before database reads without member.read", async () => {
		mocks.checkPermission.mockRejectedValueOnce(new Error("Permission denied"));

		await expect(createCaller().all()).rejects.toThrow("Permission denied");

		expect(mocks.organizationRoleFindMany).not.toHaveBeenCalled();
		expect(mocks.select).not.toHaveBeenCalled();
	});
});
