import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (role: string) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [] as string[],
	accessedServices: [] as string[],
	accessedEnvironments: [] as string[],
	accessedServers: [] as string[],
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

let memberToReturn = mockMemberData("deployer");
let rolesToReturn: { permission: string }[] = [];

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			organizationRole: {
				findFirst: vi.fn(),
				findMany: vi.fn(() => Promise.resolve(rolesToReturn)),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(true)),
}));

const { checkPermission, resolvePermissions } = await import(
	"@dokploy/server/services/permission"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

const withPermissions = (permissions: Record<string, string[]>) => {
	rolesToReturn = [{ permission: JSON.stringify(permissions) }];
};

beforeEach(() => {
	vi.clearAllMocks();
	memberToReturn = mockMemberData("deployer");
	rolesToReturn = [];
});

describe("server.terminal on custom roles", () => {
	it("a role with server.read alone cannot open a terminal", async () => {
		withPermissions({ server: ["read"] });

		await expect(
			checkPermission(ctx, { server: ["read"] }),
		).resolves.toBeUndefined();
		await expect(
			checkPermission(ctx, { server: ["terminal"] }),
		).rejects.toThrow();

		const perms = await resolvePermissions(ctx);
		expect(perms.server.read).toBe(true);
		expect(perms.server.terminal).toBe(false);
	});

	it("a role with server.terminal can open a terminal", async () => {
		withPermissions({ server: ["read", "terminal"] });

		await expect(
			checkPermission(ctx, { server: ["terminal"] }),
		).resolves.toBeUndefined();

		const perms = await resolvePermissions(ctx);
		expect(perms.server.terminal).toBe(true);
	});

	it("owner and admin keep terminal access", async () => {
		for (const role of ["owner", "admin"]) {
			memberToReturn = mockMemberData(role);
			await expect(
				checkPermission(ctx, { server: ["terminal"] }),
			).resolves.toBeUndefined();

			const perms = await resolvePermissions(ctx);
			expect(perms.server.terminal).toBe(true);
		}
	});
});
