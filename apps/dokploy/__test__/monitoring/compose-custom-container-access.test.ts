import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbSelect: vi.fn(),
	getMetricsTarget: vi.fn(),
	getRemoteDocker: vi.fn(),
	listContainers: vi.fn(),
	providerFetch: vi.fn(),
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
	hasPermission: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	ACCOUNT_DELETION_CODE_TTL_MINUTES: 10,
	consumeAccountDeletionCode: vi.fn(),
	createAccountDeletionCode: vi.fn(),
	createApiKey: vi.fn(),
	createOrganizationUserWithCredentials: vi.fn(),
	findCredentialAccount: vi.fn(),
	findNotificationById: vi.fn(),
	findOrganizationById: vi.fn(),
	findPasskeysByUserId: vi.fn(),
	findUserById: vi.fn(),
	getDokployUrl: vi.fn(),
	getRootAdminIds: vi.fn(() => []),
	getUserByToken: vi.fn(),
	getWebServerSettings: vi.fn(),
	IS_CLOUD: false,
	removeUserById: vi.fn(),
	renderInvitationEmail: vi.fn(),
	sendAccountDeletionCodeEmail: vi.fn(),
	sendEmailNotification: vi.fn(),
	sendResendNotification: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { select: mocks.dbSelect },
}));

vi.mock("@dokploy/server/services/logs-and-metrics/provider-fetch", () => ({
	providerFetch: mocks.providerFetch,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServiceAccess: mocks.checkServiceAccess,
	hasPermission: mocks.hasPermission,
	resolvePermissions: vi.fn(),
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	getMetricsTarget: mocks.getMetricsTarget,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(),
}));

vi.mock("@/server/utils/account-deletion", () => ({
	deleteAccount: vi.fn(),
}));

const { userRouter } = await import("@/server/api/routers/user");

const caller = userRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "member" },
} as Parameters<typeof userRouter.createCaller>[0]);

describe("Compose custom container monitoring access", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		let selectCount = 0;
		mocks.dbSelect.mockImplementation(() => {
			selectCount += 1;
			const queryNumber = selectCount;
			const builder = {
				from: vi.fn(),
				where: vi.fn(),
				limit: vi.fn(async () => []),
			};
			builder.from.mockReturnValue(builder);
			builder.where.mockImplementation(() =>
				queryNumber <= 8
					? builder
					: Promise.resolve(queryNumber === 10 ? [{ id: "compose-1" }] : []),
			);
			return builder;
		});
		mocks.getMetricsTarget.mockResolvedValue({
			origin: "http://metrics.example",
			serverId: "server-1",
		});
		mocks.getRemoteDocker.mockResolvedValue({
			listContainers: mocks.listContainers,
		});
		mocks.listContainers.mockResolvedValue([
			{
				Names: ["/web_container-testhash"],
				Labels: { "com.docker.compose.project": "compose-project" },
			},
		]);
		mocks.providerFetch.mockResolvedValue({
			ok: true,
			json: async () => [{ timestamp: "now" }],
		});
		mocks.hasPermission.mockResolvedValue(false);
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServiceAccess.mockResolvedValue(undefined);
	});

	it("resolves a custom container name through its Compose project label", async () => {
		await caller.getContainerMetrics({
			url: "http://metrics.example",
			token: "token",
			appName: "web_container-testhash",
			dataPoints: "50",
		});

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("server-1");
		expect(mocks.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"compose-1",
			"read",
		);
		expect(mocks.providerFetch).toHaveBeenCalledOnce();
	});
});
