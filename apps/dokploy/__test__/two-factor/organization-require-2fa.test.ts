import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindFirst = vi.hoisted(() => vi.fn());
const accountFindFirst = vi.hoisted(() => vi.fn());
const accountFindMany = vi.hoisted(() => vi.fn());
const memberFindFirst = vi.hoisted(() => vi.fn());
const memberFindMany = vi.hoisted(() => vi.fn());
const orgFindFirst = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			user: { findFirst: userFindFirst },
			account: { findFirst: accountFindFirst, findMany: accountFindMany },
			member: { findFirst: memberFindFirst, findMany: memberFindMany },
			organization: { findFirst: orgFindFirst },
		},
		update: vi.fn(() => ({
			set: (values: unknown) => {
				updateSet(values);
				return { where: vi.fn(async () => undefined) };
			},
		})),
	},
}));

vi.mock("@dokploy/server/index", async () => ({
	IS_CLOUD: false,
	hasValidLicense: vi.fn(async () => false),
	sendInvitationEmail: vi.fn(),
	...(await import("@dokploy/server/services/two-factor-policy")),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { organizationRouter } = await import(
	"@/server/api/routers/organization"
);

const callerAs = (role: string, userId = "owner-1") =>
	organizationRouter.createCaller({
		session: { activeOrganizationId: "org-1" },
		user: { id: userId, email: `${userId}@example.com`, role },
	} as Parameters<typeof organizationRouter.createCaller>[0]);

beforeEach(() => {
	vi.clearAllMocks();
	accountFindFirst.mockResolvedValue({ password: "hash" });
	accountFindMany.mockResolvedValue([]);
	memberFindMany.mockResolvedValue([]);
	orgFindFirst.mockResolvedValue({ id: "org-1", require2FA: false });
});

describe("organization.setRequire2FA", () => {
	it("rejects non-owners", async () => {
		await expect(
			callerAs("admin", "admin-1").setRequire2FA({ enabled: true }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("rejects an owner who would be gated themselves", async () => {
		userFindFirst.mockResolvedValue({ id: "owner-1", twoFactorEnabled: false });

		await expect(
			callerAs("owner").setRequire2FA({ enabled: true }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("lets an owner with 2FA turn it on", async () => {
		userFindFirst.mockResolvedValue({ id: "owner-1", twoFactorEnabled: true });

		await callerAs("owner").setRequire2FA({ enabled: true });

		expect(updateSet).toHaveBeenCalledWith({ require2FA: true });
	});

	it("lets an owner without a password turn it on", async () => {
		userFindFirst.mockResolvedValue({ id: "owner-1", twoFactorEnabled: false });
		accountFindFirst.mockResolvedValue(undefined);

		await callerAs("owner").setRequire2FA({ enabled: true });

		expect(updateSet).toHaveBeenCalledWith({ require2FA: true });
	});

	it("lets a gated owner turn it off", async () => {
		userFindFirst.mockResolvedValue({ id: "owner-1", twoFactorEnabled: false });

		await callerAs("owner").setRequire2FA({ enabled: false });

		expect(updateSet).toHaveBeenCalledWith({ require2FA: false });
	});
});

describe("organization.require2FAImpact", () => {
	it("counts members who would be gated by the switch", async () => {
		memberFindMany.mockResolvedValue([
			{ userId: "a", require2FA: false, user: { twoFactorEnabled: false } },
			{ userId: "b", require2FA: false, user: { twoFactorEnabled: true } },
			{ userId: "c", require2FA: false, user: { twoFactorEnabled: false } },
			{ userId: "d", require2FA: true, user: { twoFactorEnabled: false } },
		]);
		accountFindMany.mockResolvedValue([
			{ userId: "a", providerId: "credential", password: "hash" },
			{ userId: "b", providerId: "credential", password: "hash" },
			{ userId: "c", providerId: "github", password: null },
			{ userId: "d", providerId: "credential", password: "hash" },
		]);

		const result = await callerAs("owner").require2FAImpact();

		expect(result).toEqual({ affectedMembers: 2 });
	});
});

describe("organization.setMemberRequire2FA", () => {
	it("refuses to target the owner", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-owner",
			userId: "owner-1",
			organizationId: "org-1",
			role: "owner",
			user: { email: "owner@example.com" },
		});

		await expect(
			callerAs("admin", "admin-1").setMemberRequire2FA({
				memberId: "m-owner",
				require2FA: true,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("refuses a member of another organization", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-2",
			userId: "u-2",
			organizationId: "org-2",
			role: "member",
			user: { email: "u2@example.com" },
		});

		await expect(
			callerAs("owner").setMemberRequire2FA({
				memberId: "m-2",
				require2FA: true,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("refuses an admin targeting another admin", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-3",
			userId: "admin-2",
			organizationId: "org-1",
			role: "admin",
			user: { email: "admin2@example.com" },
		});

		await expect(
			callerAs("admin", "admin-1").setMemberRequire2FA({
				memberId: "m-3",
				require2FA: true,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("sets the flag on a member", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-4",
			userId: "u-4",
			organizationId: "org-1",
			role: "member",
			user: { email: "u4@example.com" },
		});

		await callerAs("admin", "admin-1").setMemberRequire2FA({
			memberId: "m-4",
			require2FA: true,
		});

		expect(updateSet).toHaveBeenCalledWith({ require2FA: true });
	});
});
