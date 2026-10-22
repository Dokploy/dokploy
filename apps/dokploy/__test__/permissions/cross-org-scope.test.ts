import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMemberData = (
	role: string,
	accessedServices: string[] = [],
	accessedProjects: string[] = [],
	accessedEnvironments: string[] = [],
) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-a",
	accessedProjects,
	accessedServices,
	accessedEnvironments,
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

let memberToReturn: ReturnType<typeof mockMemberData> = mockMemberData("owner");

// Two organizations; every id encodes the org that owns it.
const serviceOrgs: Record<string, string> = {
	"app-a": "org-a",
	"app-b": "org-b",
	"postgres-b": "org-b",
};
const projectOrgs: Record<string, string> = {
	"project-a": "org-a",
	"project-b": "org-b",
};
const environmentOrgs: Record<string, string> = {
	"env-a": "org-a",
	"env-b": "org-b",
};

// Pulls the bound id out of a drizzle eq() expression.
const idFromWhere = (where: unknown) => {
	const chunks = (where as { queryChunks?: unknown[] })?.queryChunks ?? [];
	const param = chunks.find(
		(c) => typeof (c as { value?: unknown })?.value === "string",
	) as { value: string } | undefined;
	return param?.value;
};

vi.mock("@dokploy/server/db", () => {
	const selectChain = {
		from: () => selectChain,
		innerJoin: () => selectChain,
		where: (where: unknown) => {
			const id = idFromWhere(where);
			const organizationId = id ? serviceOrgs[id] : undefined;
			return Promise.resolve(organizationId ? [{ organizationId }] : []);
		},
	};
	return {
		db: {
			select: vi.fn(() => selectChain),
			query: {
				member: {
					findFirst: vi.fn(() => Promise.resolve(memberToReturn)),
					findMany: vi.fn(() => Promise.resolve([])),
				},
				organizationRole: {
					findFirst: vi.fn(),
					findMany: vi.fn(() => Promise.resolve([])),
				},
				projects: {
					findFirst: vi.fn(({ where }: { where: unknown }) => {
						const id = idFromWhere(where);
						const organizationId = id ? projectOrgs[id] : undefined;
						return Promise.resolve(
							organizationId ? { organizationId } : undefined,
						);
					}),
				},
				environments: {
					findFirst: vi.fn(({ where }: { where: unknown }) => {
						const id = idFromWhere(where);
						const organizationId = id ? environmentOrgs[id] : undefined;
						return Promise.resolve(
							organizationId ? { project: { organizationId } } : undefined,
						);
					}),
				},
			},
		},
	};
});

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const {
	checkEnvironmentCreationPermission,
	checkServiceAccess,
	checkServicePermissionAndAccess,
} = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-a" },
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("organization scope of service helpers", () => {
	it("admin of org A cannot pass checkServicePermissionAndAccess for a service of org B", async () => {
		memberToReturn = mockMemberData("admin");
		await expect(
			checkServicePermissionAndAccess(ctx, "app-b", { envVars: ["write"] }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("owner of org A cannot pass checkServiceAccess for a database of org B", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkServiceAccess(ctx, "postgres-b", "read"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			checkServiceAccess(ctx, "postgres-b", "delete"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("owner of org A cannot create a service in a project of org B", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkServiceAccess(ctx, "project-b", "create"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("owner of org A cannot create an environment in a project of org B", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkEnvironmentCreationPermission(ctx, "project-b"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await expect(
			checkEnvironmentCreationPermission(ctx, "project-a"),
		).resolves.toBeUndefined();
	});

	it("member of org A with a stale access entry for an org B service is rejected", async () => {
		memberToReturn = mockMemberData("member", ["app-b"]);
		await expect(
			checkServicePermissionAndAccess(ctx, "app-b", { deployment: ["read"] }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("unknown service id is NOT_FOUND", async () => {
		memberToReturn = mockMemberData("owner");
		await expect(
			checkServicePermissionAndAccess(ctx, "missing", { deployment: ["read"] }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("owner and admin still pass for services and projects of their own org", async () => {
		memberToReturn = mockMemberData("admin");
		await expect(
			checkServicePermissionAndAccess(ctx, "app-a", { envVars: ["write"] }),
		).resolves.toBeUndefined();
		await expect(
			checkServiceAccess(ctx, "app-a", "read"),
		).resolves.toBeUndefined();
		await expect(
			checkServiceAccess(ctx, "project-a", "create"),
		).resolves.toBeUndefined();
	});

	it("member with access still passes for a service of their own org", async () => {
		memberToReturn = mockMemberData("member", ["app-a"]);
		await expect(
			checkServicePermissionAndAccess(ctx, "app-a", { deployment: ["read"] }),
		).resolves.toBeUndefined();
	});
});
