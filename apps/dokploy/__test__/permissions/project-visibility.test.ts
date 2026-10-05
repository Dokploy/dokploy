import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (
	role: string,
	accessedServices: string[] = [],
	accessedProjects: string[] = [],
) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects,
	accessedServices,
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

let memberToReturn: ReturnType<typeof mockMemberData> =
	mockMemberData("member");
let scopeRows: unknown[] = [];

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
		execute: vi.fn(() => Promise.resolve(scopeRows)),
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const {
	checkProjectAccess,
	checkEnvironmentAccess,
	checkEnvironmentCreationPermission,
	checkServiceAccess,
} = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	scopeRows = [];
});

describe("derived project visibility", () => {
	it("a member holding only a service can still delete the parent project", async () => {
		memberToReturn = {
			...mockMemberData("member", ["svc-a"], []),
			canDeleteProjects: true,
		};
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];

		await expect(
			checkProjectAccess(ctx, "delete", "proj-1"),
		).resolves.toBeUndefined();
	});

	it("a member holding nothing in a project cannot delete it", async () => {
		memberToReturn = {
			...mockMemberData("member", [], []),
			canDeleteProjects: true,
		};
		scopeRows = [];

		await expect(checkProjectAccess(ctx, "delete", "proj-1")).rejects.toThrow(
			"You don't have access to this project",
		);
	});

	it("a member holding only a service can create services in that project", async () => {
		memberToReturn = {
			...mockMemberData("member", ["svc-a"], []),
			canCreateServices: true,
		};
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];

		await expect(
			checkServiceAccess(ctx, "proj-1", "create"),
		).resolves.toBeUndefined();
	});

	it("a member holding only a service can create environments in that project", async () => {
		memberToReturn = {
			...mockMemberData("member", ["svc-a"], []),
			canCreateEnvironments: true,
		};
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];

		await expect(
			checkEnvironmentCreationPermission(ctx, "proj-1"),
		).resolves.toBeUndefined();
	});

	it("an environment inside a full-access project is reachable", async () => {
		memberToReturn = mockMemberData("member", [], ["proj-1"]);
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: null },
		];

		await expect(
			checkEnvironmentAccess(ctx, "env-1", "read"),
		).resolves.toBeUndefined();
	});
});

describe("environment visibility", () => {
	it("an environment holding an explicitly granted service stays visible", async () => {
		memberToReturn = mockMemberData("member", ["svc-a"], []);
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];

		await expect(
			checkEnvironmentAccess(ctx, "env-1", "read"),
		).resolves.toBeUndefined();
	});

	it("an unrelated environment stays unreachable", async () => {
		memberToReturn = mockMemberData("member", ["svc-a"], []);
		scopeRows = [
			{ environmentId: "env-1", projectId: "proj-1", serviceId: "svc-a" },
		];

		await expect(checkEnvironmentAccess(ctx, "env-9", "read")).rejects.toThrow(
			"You don't have access to this environment",
		);
	});
});
