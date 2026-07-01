import { beforeEach, describe, expect, it, vi } from "vitest";

const containerMetric = {
	timestamp: "2026-06-23T00:00:00.000Z",
	CPU: 12,
	Memory: {
		percentage: 30,
		used: 300,
		total: 1000,
		unit: "MB",
		usedUnit: "MB",
		totalUnit: "MB",
	},
	Network: {
		input: 1,
		output: 2,
		inputUnit: "KB",
		outputUnit: "KB",
	},
	BlockIO: {
		read: 3,
		write: 4,
		readUnit: "KB",
		writeUnit: "KB",
	},
	Container: "app",
	ID: "container-1",
	Name: "app",
};

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPermission: vi.fn(),
	assertContainerMetricsServiceAccess: vi.fn(),
	createApiKey: vi.fn(),
	createOrganizationUserWithCredentials: vi.fn(),
	fetch: vi.fn(),
	findNotificationById: vi.fn(),
	findOrganizationById: vi.fn(),
	findServerById: vi.fn(),
	findUserById: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getDokployUrl: vi.fn(),
	getUserByToken: vi.fn(),
	getWebServerSettings: vi.fn(),
	memberFindFirst: vi.fn(),
	memberFindMany: vi.fn(),
	removeUserById: vi.fn(),
	renderInvitationEmail: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	createApiKey: mocks.createApiKey,
	createOrganizationUserWithCredentials:
		mocks.createOrganizationUserWithCredentials,
	findNotificationById: mocks.findNotificationById,
	findOrganizationById: mocks.findOrganizationById,
	findServerById: mocks.findServerById,
	findUserById: mocks.findUserById,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
	getDokployUrl: mocks.getDokployUrl,
	getUserByToken: mocks.getUserByToken,
	getWebServerSettings: mocks.getWebServerSettings,
	removeUserById: mocks.removeUserById,
	renderInvitationEmail: mocks.renderInvitationEmail,
	sendEmailNotification: mocks.sendEmailNotification,
	sendResendNotification: mocks.sendResendNotification,
	updateUser: mocks.updateUser,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: mocks.memberFindFirst,
				findMany: mocks.memberFindMany,
			},
		},
	},
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
	hasValidLicense: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/monitoring-access", () => ({
	assertContainerMetricsServiceAccess:
		mocks.assertContainerMetricsServiceAccess,
}));

vi.mock("@dokploy/server/utils/url/network", () => ({
	fetchWithPublicEgress: mocks.fetch,
}));

const { userRouter } = await import("../../server/api/routers/user");

const createCaller = () =>
	userRouter.createCaller({
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

describe("user.getContainerMetrics target boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.assertContainerMetricsServiceAccess.mockResolvedValue(undefined);
		mocks.fetch.mockResolvedValue({
			ok: true,
			json: async () => [containerMetric],
		});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			organizationId: "org-1",
			ipAddress: "203.0.113.10",
			metricsConfig: {
				server: {
					port: 4500,
					token: "stored-remote-token",
				},
			},
		});
		mocks.findUserById.mockResolvedValue({
			id: "owner-1",
			enablePaidFeatures: true,
		});
		mocks.getWebServerSettings.mockResolvedValue({
			serverIp: "127.0.0.1",
			metricsConfig: {
				server: {
					port: 4501,
					token: "stored-local-token",
				},
			},
		});
	});

	it("rejects caller supplied container metrics URL and token before fetch", async () => {
		await expect(
			createCaller().getContainerMetrics({
				url: "http://169.254.169.254/latest/meta-data",
				token: "attacker-token",
				appName: "app",
				dataPoints: "50",
			} as never),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("fetches remote container metrics only from the authorized stored server record", async () => {
		await expect(
			createCaller().getContainerMetrics({
				serverId: "server-1",
				appName: "app",
				dataPoints: "200",
			} as never),
		).resolves.toEqual([containerMetric]);

		expect(mocks.fetch).toHaveBeenCalledWith(
			"http://203.0.113.10:4500/metrics/containers?limit=200&appName=app",
			{
				headers: {
					Authorization: "Bearer stored-remote-token",
				},
			},
			{
				allowPrivateNetwork: true,
				fieldName: "Monitoring metrics URL",
			},
		);
		expect(mocks.assertContainerMetricsServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app",
			"server-1",
		);
	});

	it("rejects unauthorized appName metrics before fetch", async () => {
		mocks.assertContainerMetricsServiceAccess.mockRejectedValue(
			new Error("denied"),
		);

		await expect(
			createCaller().getContainerMetrics({
				serverId: "server-1",
				appName: "foreign-app",
				dataPoints: "50",
			} as never),
		).rejects.toThrow("denied");

		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("rejects inaccessible remote container metrics before fetch", async () => {
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["other-server"]));

		await expect(
			createCaller().getContainerMetrics({
				serverId: "server-1",
				appName: "app",
				dataPoints: "50",
			} as never),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});

		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("fetches local container metrics from web server settings when no server id is provided", async () => {
		await expect(
			createCaller().getContainerMetrics({
				appName: "app",
				dataPoints: "all",
			} as never),
		).resolves.toEqual([containerMetric]);

		expect(mocks.fetch).toHaveBeenCalledWith(
			"http://127.0.0.1:4501/metrics/containers?limit=all&appName=app",
			{
				headers: {
					Authorization: "Bearer stored-local-token",
				},
			},
			{
				allowPrivateNetwork: true,
				fieldName: "Monitoring metrics URL",
			},
		);
	});

	it("rejects missing trusted local container metrics config before fetch", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			serverIp: "127.0.0.1",
			metricsConfig: {
				server: {
					port: 4501,
					token: "",
				},
			},
		});

		await expect(
			createCaller().getContainerMetrics({
				appName: "app",
				dataPoints: "50",
			} as never),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it("does not expose the stored metrics token through getMetricsToken", async () => {
		await expect(createCaller().getMetricsToken()).resolves.toEqual({
			serverIp: "127.0.0.1",
			enabledFeatures: true,
			metricsConfig: {
				server: {
					port: 4501,
				},
			},
		});
	});
});
