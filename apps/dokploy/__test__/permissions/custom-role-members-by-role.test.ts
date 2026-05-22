import { beforeEach, describe, expect, it, vi } from "vitest";

const roleMembers = [
	{
		id: "member-2",
		userId: "user-2",
		email: "teammate@example.com",
		firstName: "Team",
		lastName: "Mate",
	},
];

const memberFindFirst = vi.fn();
const memberFindMany = vi.fn(() => Promise.resolve([]));
const organizationRoleFindMany = vi.fn(() => Promise.resolve([]));
const membersByRoleWhere = vi.fn(() => Promise.resolve(roleMembers));
const membersByRoleInnerJoin = vi.fn(() => ({ where: membersByRoleWhere }));
const membersByRoleFrom = vi.fn(() => ({ innerJoin: membersByRoleInnerJoin }));
const select = vi.fn(() => ({ from: membersByRoleFrom }));
const fallbackTable = {
	findFirst: vi.fn(() => Promise.resolve(undefined)),
	findMany: vi.fn(() => Promise.resolve([])),
};

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: new Proxy(
			{
				member: {
					findFirst: memberFindFirst,
					findMany: memberFindMany,
				},
				organizationRole: {
					findMany: organizationRoleFindMany,
				},
			},
			{
				get: (target, prop: "member" | "organizationRole") =>
					target[prop] ?? fallbackTable,
			},
		),
		select,
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(() => Promise.resolve({ session: null, user: null })),
}));

const { customRoleRouter } = await import(
	"@/server/api/routers/proprietary/custom-role"
);

const memberRecord = (role: "owner" | "admin" | "member") => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [] as string[],
	accessedServices: [] as string[],
	accessedEnvironments: [] as string[],
	canCreateProjects: false,
	canDeleteProjects: false,
	canCreateServices: false,
	canDeleteServices: false,
	canCreateEnvironments: false,
	canDeleteEnvironments: false,
	canAccessToTraefikFiles: false,
	canAccessToDocker: false,
	canAccessToAPI: false,
	canAccessToSSHKeys: false,
	canAccessToGitProviders: false,
	user: { id: "user-1", email: "owner@example.com" },
});

const ctxFor = (role: "owner" | "admin" | "member") =>
	({
		user: {
			id: "user-1",
			role,
			ownerId: "user-1",
			enableEnterpriseFeatures: false,
			isValidEnterpriseLicense: false,
		},
		session: {
			id: "session-1",
			token: "token",
			userId: "user-1",
			activeOrganizationId: "org-1",
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
			ipAddress: null,
			userAgent: null,
		},
		req: {},
		res: {},
	}) as any;

beforeEach(() => {
	vi.clearAllMocks();
	memberFindFirst.mockResolvedValue(memberRecord("member"));
});

describe("customRole.membersByRole", () => {
	it("blocks base members from enumerating role members", async () => {
		memberFindFirst.mockResolvedValue(memberRecord("member"));
		const caller = customRoleRouter.createCaller(ctxFor("member"));

		await expect(
			caller.membersByRole({ roleName: "support" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(select).not.toHaveBeenCalled();
	});

	it("allows admins with member.read to view assigned role members", async () => {
		memberFindFirst.mockResolvedValue(memberRecord("admin"));
		const caller = customRoleRouter.createCaller(ctxFor("admin"));

		await expect(
			caller.membersByRole({ roleName: "support" }),
		).resolves.toEqual(roleMembers);

		expect(select).toHaveBeenCalledTimes(1);
		expect(membersByRoleWhere).toHaveBeenCalledTimes(1);
	});
});
