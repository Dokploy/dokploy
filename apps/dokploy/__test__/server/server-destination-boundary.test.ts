import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applyDockerCleanupSchedule: vi.fn(),
	assertServerDestinationAllowed: vi.fn(),
	assertSshKeyAccess: vi.fn(),
	checkPermission: vi.fn(),
	createServer: vi.fn(),
	defaultCommand: vi.fn(),
	deleteServer: vi.fn(),
	findServerById: vi.fn(),
	findServersByUserId: vi.fn(),
	findUserById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getDokployUrl: vi.fn(),
	getPublicIpWithFallback: vi.fn(),
	getWebServerSettings: vi.fn(),
	hasValidLicense: vi.fn(),
	haveActiveServices: vi.fn(),
	removeDeploymentsByServerId: vi.fn(),
	redactServer: vi.fn((server) => server),
	resolveServerMetricsConfigUpdate: vi.fn((metricsConfig) => metricsConfig),
	serverAudit: vi.fn(),
	serverSetup: vi.fn(),
	serverValidate: vi.fn(),
	setupMonitoring: vi.fn(),
	updateServerById: vi.fn(),
	updateServersBasedOnQuantity: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: true,
	createServer: mocks.createServer,
	defaultCommand: mocks.defaultCommand,
	deleteServer: mocks.deleteServer,
	findServerById: mocks.findServerById,
	findServersByUserId: mocks.findServersByUserId,
	findUserById: mocks.findUserById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getDokployUrl: mocks.getDokployUrl,
	getPublicIpWithFallback: mocks.getPublicIpWithFallback,
	getWebServerSettings: mocks.getWebServerSettings,
	hasValidLicense: mocks.hasValidLicense,
	haveActiveServices: mocks.haveActiveServices,
	removeDeploymentsByServerId: mocks.removeDeploymentsByServerId,
	redactServer: mocks.redactServer,
	redactServers: vi.fn((servers) => servers.map(mocks.redactServer)),
	resolveServerMetricsConfigUpdate: mocks.resolveServerMetricsConfigUpdate,
	serverAudit: mocks.serverAudit,
	serverSetup: mocks.serverSetup,
	serverValidate: mocks.serverValidate,
	setupMonitoring: mocks.setupMonitoring,
	updateServerById: mocks.updateServerById,
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: true,
	createServer: mocks.createServer,
	defaultCommand: mocks.defaultCommand,
	deleteServer: mocks.deleteServer,
	findServerById: mocks.findServerById,
	findServersByUserId: mocks.findServersByUserId,
	findUserById: mocks.findUserById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getDokployUrl: mocks.getDokployUrl,
	getPublicIpWithFallback: mocks.getPublicIpWithFallback,
	getWebServerSettings: mocks.getWebServerSettings,
	hasValidLicense: mocks.hasValidLicense,
	haveActiveServices: mocks.haveActiveServices,
	removeDeploymentsByServerId: mocks.removeDeploymentsByServerId,
	redactServer: mocks.redactServer,
	redactServers: vi.fn((servers) => servers.map(mocks.redactServer)),
	resolveServerMetricsConfigUpdate: mocks.resolveServerMetricsConfigUpdate,
	serverAudit: mocks.serverAudit,
	serverSetup: mocks.serverSetup,
	serverValidate: mocks.serverValidate,
	setupMonitoring: mocks.setupMonitoring,
	updateServerById: mocks.updateServerById,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	hasPermission: vi.fn(),
	resolvePermissions: vi.fn(),
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

vi.mock("@dokploy/server/services/ssh-key", () => ({
	assertSshKeyAccess: mocks.assertSshKeyAccess,
}));

vi.mock("@dokploy/server/utils/servers/destination", () => ({
	assertServerDestinationAllowed: mocks.assertServerDestinationAllowed,
}));

vi.mock("@dokploy/server/utils/url/network", () => ({
	fetchWithPublicEgress: vi.fn(),
}));

vi.mock("@/pages/api/stripe/webhook", () => ({
	updateServersBasedOnQuantity: mocks.updateServersBasedOnQuantity,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

vi.mock("@/server/queues/concurrency", () => ({
	assertBuildsConcurrencyAllowed: vi.fn(),
}));

vi.mock("@/server/utils/docker-cleanup", () => ({
	applyDockerCleanupSchedule: mocks.applyDockerCleanupSchedule,
}));

const { serverRouter } = await import("../../server/api/routers/server");
const { assertServerDestinationAllowed } = await import(
	"@dokploy/server/utils/servers/destination"
);

const createCaller = () =>
	serverRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "actor-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "actor-1",
			email: "owner@example.com",
			role: "owner",
			ownerId: "actor-1",
			enableEnterpriseFeatures: false,
			isValidEnterpriseLicense: false,
		},
	} as never);

const serverInput = {
	name: "remote",
	description: null,
	ipAddress: "169.254.169.254",
	port: 22,
	username: "root",
	sshKeyId: "ssh-1",
	serverType: "deploy" as const,
	enableDockerCleanup: true,
};

describe("server destination boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertSshKeyAccess.mockResolvedValue(undefined);
		mocks.findUserById.mockResolvedValue({
			id: "actor-1",
			serversQuantity: 10,
		});
		mocks.findServersByUserId.mockResolvedValue([]);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			name: "primary",
			organizationId: "org-1",
			serverStatus: "active",
			serverType: "deploy",
		});
		mocks.createServer.mockResolvedValue({ serverId: "server-2" });
		mocks.updateServerById.mockResolvedValue({ serverId: "server-1" });
	});

	it("rejects cloud server create destinations before persistence", async () => {
		mocks.assertServerDestinationAllowed.mockRejectedValue(
			new Error("Server address is not allowed in cloud deployments"),
		);

		await expect(createCaller().create(serverInput)).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Server address is not allowed in cloud deployments",
		});

		expect(assertServerDestinationAllowed).toHaveBeenCalledWith(serverInput);
		expect(mocks.createServer).not.toHaveBeenCalled();
		expect(mocks.assertSshKeyAccess).not.toHaveBeenCalled();
	});

	it("rejects cloud server update destinations before persistence", async () => {
		mocks.assertServerDestinationAllowed.mockRejectedValue(
			new Error("Server address is not allowed in cloud deployments"),
		);

		await expect(
			createCaller().update({
				...serverInput,
				serverId: "server-1",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Server address is not allowed in cloud deployments",
		});

		expect(assertServerDestinationAllowed).toHaveBeenCalledWith({
			...serverInput,
			serverId: "server-1",
		});
		expect(mocks.updateServerById).not.toHaveBeenCalled();
	});

	it("preserves public cloud server destinations", async () => {
		mocks.assertServerDestinationAllowed.mockResolvedValue(undefined);

		await expect(
			createCaller().create({
				...serverInput,
				ipAddress: "203.0.113.20",
			}),
		).resolves.toMatchObject({ serverId: "server-2" });

		expect(mocks.createServer).toHaveBeenCalledWith(
			expect.objectContaining({ ipAddress: "203.0.113.20" }),
			"org-1",
		);
		expect(mocks.applyDockerCleanupSchedule).toHaveBeenCalledWith(
			"server-2",
			"org-1",
			true,
		);
	});
});
