import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	memberFindFirst: vi.fn(),
	userFindFirst: vi.fn(),
	invitationFindFirst: vi.fn(),
	orgRoleFindFirst: vi.fn(),
	updateSet: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: { findFirst: mocks.memberFindFirst },
			user: { findFirst: mocks.userFindFirst },
			invitation: { findFirst: mocks.invitationFindFirst },
			organizationRole: { findFirst: mocks.orgRoleFindFirst },
		},
		update: vi.fn(() => ({
			set: (...args: unknown[]) => {
				mocks.updateSet(...args);
				return { where: () => Promise.resolve() };
			},
		})),
	},
}));

vi.mock("@dokploy/server/index", () => ({ IS_CLOUD: false }));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));
vi.mock("@/server/api/utils/plan-limits", () => ({
	assertMemberLimit: vi.fn(async () => undefined),
}));

const { organizationRouter } = await import(
	"@/server/api/routers/organization"
);

const callerAs = (role: string, userId = "caller-1") =>
	organizationRouter.createCaller({
		user: { id: userId, role },
		session: { activeOrganizationId: "org-a" },
	} as never);

const targetMember = (role: string) => ({
	id: "member-2",
	role,
	organizationId: "org-a",
	userId: "victim-1",
	user: { email: "victim@example.com" },
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.orgRoleFindFirst.mockResolvedValue({ role: "deployer" });
	mocks.userFindFirst.mockResolvedValue(undefined);
	mocks.invitationFindFirst.mockResolvedValue(undefined);
});

describe("updateMemberRole — privileged roles keep working", () => {
	it("owner can promote a member to admin", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("member"));
		await expect(
			callerAs("owner").updateMemberRole({
				memberId: "member-2",
				role: "admin",
			}),
		).resolves.toBe(true);
		expect(mocks.updateSet).toHaveBeenCalledWith({ role: "admin" });
	});

	it("admin can promote a member to admin", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("member"));
		await expect(
			callerAs("admin").updateMemberRole({
				memberId: "member-2",
				role: "admin",
			}),
		).resolves.toBe(true);
	});

	it("admin can assign a custom role to a member", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("member"));
		await expect(
			callerAs("admin").updateMemberRole({
				memberId: "member-2",
				role: "deployer",
			}),
		).resolves.toBe(true);
	});

	it("a custom role with member:update can still assign a non-admin custom role", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("member"));
		await expect(
			callerAs("user-manager").updateMemberRole({
				memberId: "member-2",
				role: "deployer",
			}),
		).resolves.toBe(true);
	});
});

describe("updateMemberRole — privilege escalation is blocked", () => {
	it("a custom role cannot promote a member to admin", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("member"));
		await expect(
			callerAs("user-manager").updateMemberRole({
				memberId: "member-2",
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("a custom role cannot demote an existing admin", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("admin"));
		await expect(
			callerAs("user-manager").updateMemberRole({
				memberId: "member-2",
				role: "member",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("an admin cannot change another admin's role (pre-existing rule)", async () => {
		mocks.memberFindFirst.mockResolvedValue(targetMember("admin"));
		await expect(
			callerAs("admin").updateMemberRole({
				memberId: "member-2",
				role: "member",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("inviteMember — admin ceiling", () => {
	it("a custom role cannot invite an admin", async () => {
		await expect(
			callerAs("user-manager").inviteMember({
				email: "new@example.com",
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
