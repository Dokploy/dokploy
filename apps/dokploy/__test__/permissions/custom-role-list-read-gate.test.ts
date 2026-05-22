import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (role: string) => ({
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
	user: { id: "user-1", email: "test@test.com" },
});

const organizationRoles = [
	{
		id: "role-1",
		organizationId: "org-1",
		role: "limited",
		permission: JSON.stringify({ service: ["read"] }),
		createdAt: new Date("2026-01-01T00:00:00Z"),
	},
];

const groupBy = vi.fn(() => Promise.resolve([{ role: "limited", count: 1 }]));
const where = vi.fn(() => ({ groupBy }));
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(mockMemberData("limited"))),
			},
			organizationRole: {
				findMany: vi.fn(() => Promise.resolve(organizationRoles)),
			},
		},
		select,
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@dokploy/server/index", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(() =>
		Promise.resolve({
			session: null,
			user: null,
		}),
	),
}));

const { customRoleRouter } = await import(
	"../../server/api/routers/proprietary/custom-role"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
	req: {},
	res: {},
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("customRole.all permission gate", () => {
	it("rejects users without member.read before listing custom roles", async () => {
		const caller = customRoleRouter.createCaller(ctx as never);

		await expect(caller.all()).rejects.toThrow("member");
		expect(select).not.toHaveBeenCalled();
	});
});
