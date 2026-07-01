import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	findOrganizationById: vi.fn(),
	hasValidLicense: vi.fn(),
	serverFindMany: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createApiKey: vi.fn(),
	createOrganizationUserWithCredentials: vi.fn(),
	findNotificationById: vi.fn(),
	findOrganizationById: mocks.findOrganizationById,
	findServerById: vi.fn(),
	findUserById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getDokployUrl: vi.fn(),
	getUserByToken: vi.fn(),
	getWebServerSettings: vi.fn(),
	removeUserById: vi.fn(),
	renderInvitationEmail: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			server: {
				findMany: mocks.serverFindMany,
			},
		},
		update: vi.fn(() => ({
			set: mocks.updateSet,
		})),
	},
}));

vi.mock("@dokploy/server/services/permission", () => ({
	assertRoleAssignmentAllowed: vi.fn(),
	checkPermission: mocks.checkPermission,
	hasPermission: vi.fn(),
	resolvePermissions: vi.fn(),
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

vi.mock("@dokploy/server/utils/url/network", () => ({
	fetchWithPublicEgress: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/monitoring-access", () => ({
	assertContainerMetricsServiceAccess: vi.fn(),
}));

const { userRouter } = await import("../../server/api/routers/user");

const createCaller = () =>
	userRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "owner-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "owner-1",
			ownerId: "owner-1",
			role: "owner",
		},
	} as never);

const permissionsInput = (accessedServers: string[]) => ({
	id: "member-1",
	accessedProjects: [],
	accessedEnvironments: [],
	accessedServices: [],
	accessedGitProviders: [],
	accessedServers,
	canCreateProjects: false,
	canCreateServices: false,
	canDeleteProjects: false,
	canDeleteServices: false,
	canAccessToDocker: false,
	canAccessToTraefikFiles: false,
	canAccessToAPI: false,
	canAccessToSSHKeys: false,
	canAccessToGitProviders: false,
	canDeleteEnvironments: false,
	canCreateEnvironments: false,
});

describe("assignPermissions server assignment boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.audit.mockResolvedValue(undefined);
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.findOrganizationById.mockResolvedValue({ ownerId: "owner-1" });
		mocks.hasValidLicense.mockResolvedValue(true);
		mocks.serverFindMany.mockResolvedValue([{ serverId: "server-1" }]);
		mocks.updateWhere.mockResolvedValue([]);
		mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
	});

	it("rejects accessedServers outside the active organization before saving member permissions", async () => {
		await expect(
			createCaller().assignPermissions(
				permissionsInput(["server-1", "foreign-server"]),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("allows accessedServers that all belong to the active organization", async () => {
		mocks.serverFindMany.mockResolvedValue([
			{ serverId: "server-1" },
			{ serverId: "server-2" },
		]);

		await expect(
			createCaller().assignPermissions(
				permissionsInput(["server-1", "server-2"]),
			),
		).resolves.toBeUndefined();

		expect(mocks.updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				accessedServers: ["server-1", "server-2"],
			}),
		);
	});
});
