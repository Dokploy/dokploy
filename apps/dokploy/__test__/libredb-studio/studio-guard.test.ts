import { beforeEach, describe, expect, it, vi } from "vitest";

const STUDIO_APP = "studio-app";
const OTHER_APP = "other-app";
const STUDIO_GUARD_MESSAGE =
	"Only owners and admins of the organization can change a LibreDB Studio. Members can open it with Open in LibreDB Studio.";

const mockMemberData = (role: string, accessedServices: string[] = []) => ({
	id: "member-1",
	role,
	userId: "user-1",
	organizationId: "org-1",
	accessedProjects: [] as string[],
	accessedServices,
	accessedEnvironments: [] as string[],
	canCreateProjects: false,
	canDeleteProjects: false,
	canCreateServices: true,
	canDeleteServices: true,
	canCreateEnvironments: false,
	canDeleteEnvironments: false,
	canAccessToTraefikFiles: false,
	canAccessToDocker: false,
	canAccessToAPI: false,
	canAccessToSSHKeys: false,
	canAccessToGitProviders: false,
	user: { id: "user-1", email: "test@test.com" },
});

const state = vi.hoisted(() => ({ member: null as unknown }));

const studioFindFirst = vi.hoisted(() => vi.fn());
const studioFindMany = vi.hoisted(() => vi.fn());
const domainsFindMany = vi.hoisted(() => vi.fn());
const serviceRows = vi.hoisted(() => ({
	applications: vi.fn(),
	compose: vi.fn(),
	previewDeployments: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(() => Promise.resolve(state.member)),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			organizationRole: {
				findFirst: vi.fn(),
				findMany: vi.fn(() => Promise.resolve([])),
			},
			libredbStudio: { findFirst: studioFindFirst, findMany: studioFindMany },
			domains: { findMany: domainsFindMany },
			applications: { findFirst: serviceRows.applications },
			compose: { findFirst: serviceRows.compose },
			previewDeployments: { findFirst: serviceRows.previewDeployments },
		},
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(() => Promise.resolve(false)),
}));

const {
	checkLibreDBStudioHost,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	isLibreDBStudioApplication,
	LIBREDB_STUDIO_MEMBER_CHANGE_MESSAGE,
} = await import("@dokploy/server/services/permission");

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

const studioRefusal = {
	code: "UNAUTHORIZED",
	message: STUDIO_GUARD_MESSAGE,
};

const NON_READ_PERMISSIONS = [
	{ domain: ["create"] },
	{ domain: ["delete"] },
	{ deployment: ["create"] },
	{ deployment: ["cancel"] },
	{ envVars: ["write"] },
	{ schedule: ["create"] },
	{ schedule: ["update"] },
	{ schedule: ["delete"] },
	{ volumeBackup: ["create"] },
	{ volumeBackup: ["update"] },
	{ volumeBackup: ["delete"] },
	{ volumeBackup: ["restore"] },
	{ volume: ["create"] },
	{ volume: ["delete"] },
	{ service: ["create"] },
	{ service: ["delete"] },
	{ domain: ["read", "create"] },
	{ deployment: ["read"], envVars: ["write"] },
] as const;

const READ_PERMISSIONS = [
	{ service: ["read"] },
	{ domain: ["read"] },
	{ deployment: ["read"] },
	{ envVars: ["read"] },
	{ schedule: ["read"] },
	{ volumeBackup: ["read"] },
	{ volume: ["read"] },
	{ logs: ["read"] },
	{ monitoring: ["read"] },
	{ deployment: ["read"], logs: ["read"] },
] as const;

beforeEach(() => {
	vi.clearAllMocks();
	state.member = mockMemberData("member", [STUDIO_APP, OTHER_APP]);
});

const asStudio = () => {
	studioFindFirst.mockResolvedValue({ libredbStudioId: "studio-1" });
};

const asOtherService = () => {
	studioFindFirst.mockResolvedValue(undefined);
};

describe("LIBREDB_STUDIO_MEMBER_CHANGE_MESSAGE", () => {
	it("is the exact refusal sentence", () => {
		expect(LIBREDB_STUDIO_MEMBER_CHANGE_MESSAGE).toBe(STUDIO_GUARD_MESSAGE);
	});
});

describe("isLibreDBStudioApplication", () => {
	it("is true when a libredb_studio row names the application", async () => {
		asStudio();
		await expect(isLibreDBStudioApplication(STUDIO_APP)).resolves.toBe(true);
		expect(studioFindFirst).toHaveBeenCalledWith(
			expect.objectContaining({ columns: { libredbStudioId: true } }),
		);
	});

	it("is false for any other service", async () => {
		asOtherService();
		await expect(isLibreDBStudioApplication(OTHER_APP)).resolves.toBe(false);
	});
});

describe("checkServicePermissionAndAccess on a LibreDB Studio", () => {
	it.each(NON_READ_PERMISSIONS)(
		"refuses a member with access for %j",
		async (permissions) => {
			asStudio();
			await expect(
				checkServicePermissionAndAccess(ctx, STUDIO_APP, permissions as never),
			).rejects.toMatchObject(studioRefusal);
		},
	);

	it.each(READ_PERMISSIONS)(
		"lets a member with access read %j",
		async (permissions) => {
			asStudio();
			await expect(
				checkServicePermissionAndAccess(ctx, STUDIO_APP, permissions as never),
			).resolves.toBeUndefined();
			expect(studioFindFirst).not.toHaveBeenCalled();
		},
	);

	it.each(["owner", "admin"])(
		"lets an %s change the Studio without a Studio lookup",
		async (role) => {
			state.member = mockMemberData(role);
			asStudio();
			for (const permissions of NON_READ_PERMISSIONS) {
				await expect(
					checkServicePermissionAndAccess(
						ctx,
						STUDIO_APP,
						permissions as never,
					),
				).resolves.toBeUndefined();
			}
			expect(studioFindFirst).not.toHaveBeenCalled();
		},
	);

	it.each(NON_READ_PERMISSIONS)(
		"lets a member change a service that is not a Studio for %j",
		async (permissions) => {
			asOtherService();
			await expect(
				checkServicePermissionAndAccess(ctx, OTHER_APP, permissions as never),
			).resolves.toBeUndefined();
		},
	);

	it("still refuses a member without access to the Studio with the access message", async () => {
		state.member = mockMemberData("member", [OTHER_APP]);
		asStudio();
		await expect(
			checkServicePermissionAndAccess(ctx, STUDIO_APP, {
				domain: ["create"],
			}),
		).rejects.toThrow("You don't have access to this service");
	});
});

describe("checkServiceAccess on a LibreDB Studio", () => {
	it("refuses a member who may delete services to delete the Studio", async () => {
		asStudio();
		await expect(
			checkServiceAccess(ctx, STUDIO_APP, "delete"),
		).rejects.toMatchObject(studioRefusal);
	});

	it("lets the member read the Studio without a Studio lookup", async () => {
		asStudio();
		await expect(
			checkServiceAccess(ctx, STUDIO_APP, "read"),
		).resolves.toBeUndefined();
		expect(studioFindFirst).not.toHaveBeenCalled();
	});

	it("checks a project for create without a Studio lookup", async () => {
		state.member = {
			...mockMemberData("member", [STUDIO_APP]),
			accessedProjects: ["project-1"],
		};
		asStudio();
		await expect(
			checkServiceAccess(ctx, "project-1", "create"),
		).resolves.toBeUndefined();
		expect(studioFindFirst).not.toHaveBeenCalled();
	});

	it("lets the member delete a service that is not a Studio", async () => {
		asOtherService();
		await expect(
			checkServiceAccess(ctx, OTHER_APP, "delete"),
		).resolves.toBeUndefined();
	});

	it.each(["owner", "admin"])(
		"lets an %s delete the Studio without a Studio lookup",
		async (role) => {
			state.member = mockMemberData(role);
			asStudio();
			await expect(
				checkServiceAccess(ctx, STUDIO_APP, "delete"),
			).resolves.toBeUndefined();
			expect(studioFindFirst).not.toHaveBeenCalled();
		},
	);
});

describe("checkLibreDBStudioHost", () => {
	const ownApp = { applicationId: OTHER_APP };
	const studioDomain = (host: string, serverId: string | null) => ({
		host,
		applicationId: STUDIO_APP,
		application: { serverId },
	});
	const studioDomainsOn = (serverId: string | null) => [
		studioDomain("Studio.Example.com", serverId),
		studioDomain("bücher.example", serverId),
	];
	const hostRefusal = {
		code: "CONFLICT",
		message:
			"Another service already uses this domain. Choose a domain that only this service uses.",
	};

	beforeEach(() => {
		domainsFindMany.mockResolvedValue(studioDomainsOn(null));
		studioFindFirst.mockResolvedValue({ libredbStudioId: "studio-1" });
		serviceRows.applications.mockResolvedValue({ serverId: null });
		serviceRows.compose.mockResolvedValue({ serverId: "srv-1" });
		serviceRows.previewDeployments.mockResolvedValue({
			application: { serverId: "srv-1" },
		});
	});

	it.each([
		"studio.example.com",
		" STUDIO.example.com ",
		"studio.example.com.",
		"xn--bcher-kva.example",
	])("refuses a member the Studio host %j", async (host) => {
		await expect(
			checkLibreDBStudioHost(ctx, host, ownApp),
		).rejects.toMatchObject(hostRefusal);
	});

	it("queries the domains by host instead of loading every Studio", async () => {
		await expect(
			checkLibreDBStudioHost(ctx, "studio.example.com", ownApp),
		).rejects.toMatchObject(hostRefusal);
		expect(domainsFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.anything() }),
		);
		expect(studioFindMany).not.toHaveBeenCalled();
	});

	it("passes a member another host", async () => {
		await expect(
			checkLibreDBStudioHost(ctx, "app.example.com", ownApp),
		).resolves.toBeUndefined();
	});

	it("passes a host that only a service other than a Studio uses", async () => {
		studioFindFirst.mockResolvedValue(undefined);
		await expect(
			checkLibreDBStudioHost(ctx, "studio.example.com", ownApp),
		).resolves.toBeUndefined();
	});

	it("passes the host of a Studio on another server, which has its own Traefik", async () => {
		domainsFindMany.mockResolvedValue(studioDomainsOn("srv-2"));
		await expect(
			checkLibreDBStudioHost(ctx, "studio.example.com", ownApp),
		).resolves.toBeUndefined();
	});

	it.each([
		["a compose", { composeId: "compose-1" }],
		["a preview", { previewDeploymentId: "preview-1" }],
	])(
		"refuses the host of a Studio on the server of %s domain",
		async (_name, target) => {
			domainsFindMany.mockResolvedValue(studioDomainsOn("srv-1"));
			await expect(
				checkLibreDBStudioHost(ctx, "studio.example.com", target),
			).rejects.toMatchObject(hostRefusal);
			await expect(
				checkLibreDBStudioHost(ctx, "studio.example.com", ownApp),
			).resolves.toBeUndefined();
		},
	);

	it("refuses a preview-only write with a Studio's host on the preview's server", async () => {
		domainsFindMany.mockResolvedValue(studioDomainsOn("srv-1"));
		const previewOnly = {
			previewDeploymentId: "preview-1",
			applicationId: null,
			composeId: null,
		};
		await expect(
			checkLibreDBStudioHost(ctx, "studio.example.com", previewOnly),
		).rejects.toMatchObject(hostRefusal);
		await expect(
			checkLibreDBStudioHost(ctx, "pr-1.example.com", previewOnly),
		).resolves.toBeUndefined();
	});

	it.each([
		["no service", {}],
		["only null services", { applicationId: null, previewDeploymentId: null }],
		["an application that does not exist", { applicationId: "missing" }],
		["a compose that does not exist", { composeId: "missing" }],
		["a preview that does not exist", { previewDeploymentId: "missing" }],
	])(
		"refuses a write whose target is %s, on any host",
		async (_name, target) => {
			serviceRows.applications.mockResolvedValue(undefined);
			serviceRows.compose.mockResolvedValue(undefined);
			serviceRows.previewDeployments.mockResolvedValue(undefined);
			await expect(
				checkLibreDBStudioHost(ctx, "app.example.com", target),
			).rejects.toMatchObject({
				code: "NOT_FOUND",
				message: "The service of this domain was not found.",
			});
		},
	);

	it("refuses an existing application paired with a missing compose", async () => {
		serviceRows.compose.mockResolvedValue(undefined);
		await expect(
			checkLibreDBStudioHost(ctx, "app.example.com", {
				applicationId: OTHER_APP,
				composeId: "missing",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it.each(["owner", "admin"])(
		"lets an %s use a Studio host without the lookup",
		async (role) => {
			state.member = mockMemberData(role);
			await expect(
				checkLibreDBStudioHost(ctx, "studio.example.com", ownApp),
			).resolves.toBeUndefined();
			expect(domainsFindMany).not.toHaveBeenCalled();
			expect(studioFindMany).not.toHaveBeenCalled();
		},
	);
});
