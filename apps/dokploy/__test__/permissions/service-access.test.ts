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

const { mockServiceOrganizationId } = vi.hoisted(() => ({
	mockServiceOrganizationId: {
		value: "org-1" as string | undefined,
	},
}));

// Every service/project id used below belongs to the caller's to org-1 unless configured as deleted.
vi.mock("@dokploy/server/db", () => {
	const selectChain = {
		from: () => selectChain,
		innerJoin: () => selectChain,
		where: () =>
			Promise.resolve(
				mockServiceOrganizationId.value
					? [
							{
								organizationId: mockServiceOrganizationId.value,
							},
						]
					: [],
			),
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
					findFirst: vi.fn(() =>
						Promise.resolve({
							organizationId: "org-1",
						}),
					),
				},
			},
		},
	};
});

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

const scopedCtx = (services: string[]) => ({
	...ctx,
	apiKeyScope: { services },
});

beforeEach(() => {
	vi.clearAllMocks();
	memberToReturn = mockMemberData("member");
	mockServiceOrganizationId.value = "org-1";
});

describe("checkServicePermissionAndAccess", () => {
	it("owner bypasses accessedServices check", async () => {
		memberToReturn = mockMemberData("owner", []);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).resolves.toBeUndefined();
	});

	it("admin bypasses accessedServices check", async () => {
		memberToReturn = mockMemberData("admin", []);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				backup: ["create"],
			}),
		).resolves.toBeUndefined();
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

	it("scoped API key can access a service in its allowlist", async () => {
		memberToReturn = mockMemberData("member", ["service-123"]);
		await expect(
			checkServicePermissionAndAccess(
				scopedCtx(["service-123"]),
				"service-123",
				{ deployment: ["read"] },
			),
		).resolves.toBeUndefined();
	});

	it("scoped API key cannot access a service outside its allowlist", async () => {
		memberToReturn = mockMemberData("member", ["service-123"]);
		await expect(
			checkServicePermissionAndAccess(
				scopedCtx(["other-service"]),
				"service-123",
				{ deployment: ["read"] },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it.each(["owner", "admin"])(
		"%s cannot bypass the API key service scope",
		async (role) => {
			memberToReturn = mockMemberData(role, []);
			await expect(
				checkServicePermissionAndAccess(
					scopedCtx(["other-service"]),
					"service-123",
					{ deployment: ["read"] },
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		},
	);

	it("an empty API key service scope denies all service access", async () => {
		memberToReturn = mockMemberData("owner", []);
		await expect(
			checkServicePermissionAndAccess(scopedCtx([]), "service-123", {
				deployment: ["read"],
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it.each([
		["included in the scope", ["deleted-service"]],
		["excluded from the scope", ["another-service"]],
	])(
		"returns NOT_FOUND when the service is deleted and %s",
		async (_description, services) => {
			mockServiceOrganizationId.value = undefined;

			await expect(
				checkServicePermissionAndAccess(
					scopedCtx(services),
					"deleted-service",
					{ deployment: ["read"] },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		},
	);

	it("an absent API key scope preserves existing authorization behavior", async () => {
		memberToReturn = mockMemberData("member", ["service-123"]);
		await expect(
			checkServicePermissionAndAccess(ctx, "service-123", {
				deployment: ["read"],
			}),
		).resolves.toBeUndefined();
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

	it("scoped API key can read a service in its allowlist", async () => {
		memberToReturn = mockMemberData("member", ["app-1"]);
		await expect(
			checkServiceAccess(scopedCtx(["app-1"]), "app-1", "read"),
		).resolves.toBeUndefined();
	});

	it("scoped API key cannot read a service outside its allowlist", async () => {
		memberToReturn = mockMemberData("member", ["app-1"]);
		await expect(
			checkServiceAccess(scopedCtx(["other-service"]), "app-1", "read"),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("an empty API key service scope denies all service reads", async () => {
		memberToReturn = mockMemberData("owner", []);
		await expect(
			checkServiceAccess(scopedCtx([]), "app-1", "read"),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it.each([
		["included in the scope", ["deleted-service"]],
		["excluded from the scope", ["another-service"]],
	])(
		"returns NOT_FOUND when the service is deleted and %s",
		async (_description, services) => {
			mockServiceOrganizationId.value = undefined;
			await expect(
				checkServiceAccess(scopedCtx(services), "deleted-service", "read"),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		},
	);

	it("API key scope does not treat a project ID as a service ID during creation", async () => {
		memberToReturn = mockMemberData("owner", [], []);
		await expect(
			checkServiceAccess(scopedCtx([]), "project-1", "create"),
		).resolves.toBeUndefined();
	});

	it("an absent API key scope preserves existing authorization behavior", async () => {
		memberToReturn = mockMemberData("member", ["app-1"]);
		await expect(
			checkServiceAccess(ctx, "app-1", "read"),
		).resolves.toBeUndefined();
	});
});
