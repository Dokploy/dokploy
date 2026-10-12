import { beforeEach, describe, expect, it, vi } from "vitest";

const memberFindMany = vi.hoisted(() => vi.fn());
const getTwoFactorStatuses = vi.hoisted(() => vi.fn());
const createOrganizationUserWithCredentials = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { member: { findMany: memberFindMany } } },
}));

// "@dokploy/server" resolves to the same module.
vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	hasValidLicense: vi.fn(async () => false),
	getTwoFactorStatuses,
	createOrganizationUserWithCredentials,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/audit", () => ({ audit }));

vi.mock("@/server/utils/account-deletion", () => ({
	deleteAccount: vi.fn(),
}));

const { userRouter } = await import("@/server/api/routers/user");

const caller = userRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "owner-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof userRouter.createCaller>[0]);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("user.all", () => {
	it("reports 2FA status for the active organization only", async () => {
		const memberUser = { id: "u1", twoFactorEnabled: false };
		memberFindMany.mockResolvedValue([
			{ id: "m1", userId: "u1", user: memberUser },
		]);
		getTwoFactorStatuses.mockResolvedValue(
			new Map([["u1", { status: "pending", providers: ["credential"] }]]),
		);

		const [row] = await caller.all();

		expect(getTwoFactorStatuses).toHaveBeenCalledWith([memberUser], {
			organizationId: "org-1",
		});
		expect(row).toMatchObject({
			twoFactorStatus: "pending",
			authProviders: ["credential"],
		});
	});
});

describe("user.createUserWithCredentials", () => {
	it("stores and audits the 2FA requirement", async () => {
		createOrganizationUserWithCredentials.mockResolvedValue({
			userId: "u2",
			email: "new@example.com",
			role: "member",
		});

		await caller.createUserWithCredentials({
			email: "new@example.com",
			password: "password123",
			role: "member",
			require2FA: true,
		});

		expect(createOrganizationUserWithCredentials).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: "org-1", require2FA: true }),
		);
		expect(audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: "create",
				resourceId: "u2",
				metadata: expect.objectContaining({ require2FA: true }),
			}),
		);
	});
});
