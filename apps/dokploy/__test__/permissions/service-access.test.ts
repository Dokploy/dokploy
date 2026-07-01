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
let serviceOrganizationToReturn: string | null = "org-1";

const serviceRecord = () =>
	serviceOrganizationToReturn
		? {
				environment: {
					project: {
						organizationId: serviceOrganizationToReturn,
					},
				},
			}
		: null;

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: vi.fn(() => Promise.resolve(serviceRecord())),
			},
			compose: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			postgres: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			mysql: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			mariadb: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			mongo: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			redis: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
			libsql: {
				findFirst: vi.fn(() => Promise.resolve(null)),
			},
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

const { checkServicePermissionAndAccess, checkServiceAccess } = await import(
	"@dokploy/server/services/permission"
);

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	serviceOrganizationToReturn = "org-1";
});

describe("checkServicePermissionAndAccess", () => {
	it("owner bypasses accessedServices check for a same-organization service", async () => {
		memberToReturn = mockMemberData("owner", []);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).resolves.toBeUndefined();
	});

	it("admin bypasses accessedServices check for a same-organization service", async () => {
		memberToReturn = mockMemberData("admin", []);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				backup: ["create"],
			}),
		).resolves.toBeUndefined();
	});

	it("owner cannot access a cross-organization service id", async () => {
		memberToReturn = mockMemberData("owner", []);
		serviceOrganizationToReturn = "org-2";

		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});

	it("admin cannot access a cross-organization service id", async () => {
		memberToReturn = mockMemberData("admin", []);
		serviceOrganizationToReturn = "org-2";

		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				backup: ["create"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});

	it("member with access to service passes", async () => {
		memberToReturn = mockMemberData("member", ["service-123"]);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).resolves.toBeUndefined();
	});

	it("member WITHOUT access to service fails", async () => {
		memberToReturn = mockMemberData("member", ["other-service"]);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});

	it("member with empty accessedServices fails", async () => {
		memberToReturn = mockMemberData("member", []);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				domain: ["delete"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});

	it("member with accessedServices cannot use a cross-organization service id", async () => {
		memberToReturn = mockMemberData("member", ["service-123"]);
		serviceOrganizationToReturn = "org-2";

		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});
});

describe("checkServiceAccess", () => {
	it("member with service access passes read check", async () => {
		memberToReturn = mockMemberData("member", ["app-1"]);
		await expect(
			checkServiceAccess(ctx, "app-1", "read"),
		).resolves.toBeUndefined();
	});

	it("member without service access fails read check", async () => {
		memberToReturn = mockMemberData("member", []);
		await expect(checkServiceAccess(ctx, "app-1", "read")).rejects.toThrow(
			"You don't have access to this service",
		);
	});

	it("owner bypasses all access checks", async () => {
		memberToReturn = mockMemberData("owner", [], []);
		await expect(
			checkServiceAccess(ctx, "project-1", "create"),
		).resolves.toBeUndefined();
	});

	it("owner cannot read a cross-organization service id", async () => {
		memberToReturn = mockMemberData("owner", [], []);
		serviceOrganizationToReturn = "org-2";

		await expect(checkServiceAccess(ctx, "app-1", "read")).rejects.toThrow(
			"You don't have access to this service",
		);
	});
});
