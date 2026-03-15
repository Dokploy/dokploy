import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (
	role: string,
	overrides: Record<string, boolean> = {},
) => ({
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

let memberToReturn: ReturnType<typeof mockMemberData> =
	mockMemberData("member");

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

const { checkPermission } = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("static roles bypass enterprise resources", () => {
	it("owner bypasses deployment.read", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkPermission(ctx, { deployment: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("admin bypasses backup.create", async () => {
		memberToReturn = mockMemberData("admin");
		await expect(
			checkPermission(ctx, { backup: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("member bypasses schedule.delete", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { schedule: ["delete"] }),
		).resolves.toBeUndefined();
	});

	it("member bypasses multiple enterprise permissions at once", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, {
				deployment: ["read"],
				backup: ["create"],
				domain: ["delete"],
			}),
		).resolves.toBeUndefined();
	});
});

describe("static roles validate free-tier resources", () => {
	it("owner passes project.create", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("member fails project.create (no legacy override)", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).rejects.toThrow();
	});

	it("member passes service.read", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { service: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("member fails service.create", async () => {
		memberToReturn = mockMemberData("member");
		await expect(
			checkPermission(ctx, { service: ["create"] }),
		).rejects.toThrow();
	});
});

describe("legacy boolean overrides for member", () => {
	it("member passes project.create with canCreateProjects=true", async () => {
		memberToReturn = mockMemberData("member", { canCreateProjects: true });
		await expect(
			checkPermission(ctx, { project: ["create"] }),
		).resolves.toBeUndefined();
	});

	it("member passes docker.read with canAccessToDocker=true", async () => {
		memberToReturn = mockMemberData("member", { canAccessToDocker: true });
		await expect(
			checkPermission(ctx, { docker: ["read"] }),
		).resolves.toBeUndefined();
	});

	it("member fails docker.read with canAccessToDocker=false", async () => {
		memberToReturn = mockMemberData("member");
		await expect(checkPermission(ctx, { docker: ["read"] })).rejects.toThrow();
	});
});
