import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindFirst = vi.hoisted(() => vi.fn());
const accountFindFirst = vi.hoisted(() => vi.fn());
const accountFindMany = vi.hoisted(() => vi.fn());
const memberFindFirst = vi.hoisted(() => vi.fn());
const memberFindMany = vi.hoisted(() => vi.fn());
const orgFindFirst = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn());
const insertValues = vi.hoisted(() => vi.fn());
const invitationFindFirst = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			user: { findFirst: userFindFirst },
			account: { findFirst: accountFindFirst, findMany: accountFindMany },
			member: { findFirst: memberFindFirst, findMany: memberFindMany },
			organization: { findFirst: orgFindFirst },
			invitation: { findFirst: invitationFindFirst },
		},
		insert: vi.fn(() => ({
			values: (values: Record<string, unknown>) => {
				insertValues(values);
				return { returning: async () => [{ id: "inv-1", ...values }] };
			},
		})),
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

	it("refuses a custom role targeting an admin", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-3",
			userId: "admin-2",
			organizationId: "org-1",
			role: "admin",
			user: { email: "admin2@example.com" },
		});

		await expect(
			callerAs("support", "support-1").setMemberRequire2FA({
				memberId: "m-3",
				require2FA: false,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("lets the owner set the flag on an admin", async () => {
		memberFindFirst.mockResolvedValue({
			id: "m-3",
			userId: "admin-2",
			organizationId: "org-1",
			role: "admin",
			user: { email: "admin2@example.com" },
		});

		await callerAs("owner").setMemberRequire2FA({
			memberId: "m-3",
			require2FA: true,
		});

		expect(updateSet).toHaveBeenCalledWith({ require2FA: true });
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

const memberRow = (role: string, userId = "target-1") => ({
	id: "m-target",
	userId,
	organizationId: "org-1",
	role,
	require2FA: false,
	user: { email: `${userId}@example.com` },
});

describe("organization.updateMemberRole", () => {
	it("refuses to change the owner", async () => {
		memberFindFirst.mockResolvedValue(memberRow("owner"));

		await expect(
			callerAs("owner").updateMemberRole({
				memberId: "m-target",
				role: "member",
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "The organization owner's role cannot be changed",
		});
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("refuses to make anyone owner", async () => {
		memberFindFirst.mockResolvedValue(memberRow("member"));

		await expect(
			callerAs("owner").updateMemberRole({
				memberId: "m-target",
				role: "owner",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateSet).not.toHaveBeenCalled();
	});

	it("refuses to change your own role", async () => {
		memberFindFirst.mockResolvedValue(memberRow("admin", "admin-1"));

		await expect(
			callerAs("admin", "admin-1").updateMemberRole({
				memberId: "m-target",
				role: "member",
			}),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "You cannot change your own role",
		});
	});

	it.each(["admin", "support"])(
		"refuses a %s changing an admin's role",
		async (role) => {
			memberFindFirst.mockResolvedValue(memberRow("admin"));

			await expect(
				callerAs(role, `${role}-1`).updateMemberRole({
					memberId: "m-target",
					role: "member",
				}),
			).rejects.toMatchObject({
				code: "FORBIDDEN",
				message: "Only the organization owner can change an admin's role",
			});
			expect(updateSet).not.toHaveBeenCalled();
		},
	);

	it("lets the owner change an admin's role", async () => {
		memberFindFirst.mockResolvedValue(memberRow("admin"));

		await callerAs("owner").updateMemberRole({
			memberId: "m-target",
			role: "member",
		});

		expect(updateSet).toHaveBeenCalledWith({ role: "member" });
	});

	it("lets an admin change a member's role", async () => {
		memberFindFirst.mockResolvedValue(memberRow("member"));

		await callerAs("admin", "admin-1").updateMemberRole({
			memberId: "m-target",
			role: "admin",
		});

		expect(updateSet).toHaveBeenCalledWith({ role: "admin" });
	});
});

describe("organization.inviteMember", () => {
	beforeEach(() => {
		userFindFirst.mockResolvedValue(undefined);
		invitationFindFirst.mockResolvedValue(undefined);
	});

	it.each([true, false])(
		"stores require2FA=%s on the invitation",
		async (require2FA) => {
			await callerAs("owner").inviteMember({
				email: "New@Example.com",
				role: "member",
				require2FA,
			});

			expect(insertValues).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "new@example.com",
					organizationId: "org-1",
					require2FA,
				}),
			);
		},
	);

	it("defaults require2FA to false", async () => {
		await callerAs("owner").inviteMember({
			email: "new@example.com",
			role: "member",
		});

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({ require2FA: false }),
		);
	});
});
