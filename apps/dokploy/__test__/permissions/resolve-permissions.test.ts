import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (role: string, overrides: Record<string, boolean> = {}) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [] as string[],
	accessedServices: [] as string[],
	accessedEnvironments: [] as string[],
	canCreateProjects: overrides.canCreateProjects ?? false,
	canDeleteProjects: overrides.canDeleteProjects ?? false,
	canCreateServices: overrides.canCreateServices ?? false,
	canDeleteServices: overrides.canDeleteServices ?? false,
	canCreateEnvironments: overrides.canCreateEnvironments ?? false,
	canDeleteEnvironments: overrides.canDeleteEnvironments ?? false,
	canAccessToTraefikFiles: overrides.canAccessToTraefikFiles ?? false,
	canAccessToDocker: overrides.canAccessToDocker ?? false,
	canAccessToAPI: overrides.canAccessToAPI ?? false,
	canAccessToSSHKeys: overrides.canAccessToSSHKeys ?? false,
	canAccessToGitProviders: overrides.canAccessToGitProviders ?? false,
	user: { id: "user-1", email: "test@test.com" },
});

let memberToReturn: ReturnType<typeof mockMemberData> = mockMemberData("member");

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			organizationRole: {
				findFirst: vi.fn(),
				findMany: vi.fn(() => Promise.resolve([])),
			},
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const { resolvePermissions } = await import("@dokploy/server/services/permission");
const { enterpriseOnlyResources, statements } = await import("@dokploy/server/lib/access-control");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("enterprise resources for static roles", () => {
	it("owner gets true for all enterprise resources", async () => {
		memberToReturn = mockMemberData("owner");
		const perms = await resolvePermissions(ctx);

		for (const resource of enterpriseOnlyResources) {
			const actions = statements[resource as keyof typeof statements];
			for (const action of actions) {
				expect((perms as any)[resource][action]).toBe(true);
			}
		}
	});

	it("admin gets true for all enterprise resources", async () => {
		memberToReturn = mockMemberData("admin");
		const perms = await resolvePermissions(ctx);

		for (const resource of enterpriseOnlyResources) {
			const actions = statements[resource as keyof typeof statements];
			for (const action of actions) {
				expect((perms as any)[resource][action]).toBe(true);
			}
		}
	});

	it("member gets true for all enterprise resources", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);

		for (const resource of enterpriseOnlyResources) {
			const actions = statements[resource as keyof typeof statements];
			for (const action of actions) {
				expect((perms as any)[resource][action]).toBe(true);
			}
		}
	});
});

describe("free-tier resources for member", () => {
	it("member gets service.read=true", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.service.read).toBe(true);
	});

	it("member gets project.create=false without legacy override", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(false);
	});

	it("member gets project.create=true with canCreateProjects", async () => {
		memberToReturn = mockMemberData("member", { canCreateProjects: true });
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(true);
	});

	it("member gets docker.read=false without legacy override", async () => {
		memberToReturn = mockMemberData("member");
		const perms = await resolvePermissions(ctx);
		expect(perms.docker.read).toBe(false);
	});

	it("member gets docker.read=true with canAccessToDocker", async () => {
		memberToReturn = mockMemberData("member", { canAccessToDocker: true });
		const perms = await resolvePermissions(ctx);
		expect(perms.docker.read).toBe(true);
	});
});

describe("free-tier resources for owner", () => {
	it("owner gets all free-tier permissions as true", async () => {
		memberToReturn = mockMemberData("owner");
		const perms = await resolvePermissions(ctx);
		expect(perms.project.create).toBe(true);
		expect(perms.project.delete).toBe(true);
		expect(perms.service.create).toBe(true);
		expect(perms.service.read).toBe(true);
		expect(perms.service.delete).toBe(true);
		expect(perms.docker.read).toBe(true);
		expect(perms.traefikFiles.read).toBe(true);
		expect(perms.traefikFiles.write).toBe(true);
	});
});
