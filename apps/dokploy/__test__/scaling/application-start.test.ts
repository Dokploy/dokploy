import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	startService: vi.fn(async () => undefined),
	startServiceRemote: vi.fn(async () => undefined),
	updateApplicationStatus: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/index", async () => {
	const replicas = await vi.importActual<
		typeof import("@dokploy/server/services/scaling/replicas")
	>("@dokploy/server/services/scaling/replicas");
	return {
		IS_CLOUD: false,
		getConfiguredReplicas: replicas.getConfiguredReplicas,
		findApplicationById: mocks.findApplicationById,
		startService: mocks.startService,
		startServiceRemote: mocks.startServiceRemote,
		updateApplicationStatus: mocks.updateApplicationStatus,
	};
});

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

const { applicationRouter } = await import("@/server/api/routers/application");

const caller = applicationRouter.createCaller({
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "user@example.com", role: "owner" },
} as Parameters<typeof applicationRouter.createCaller>[0]);

describe("application.start", () => {
	beforeEach(() => {
		mocks.startService.mockClear();
		mocks.startServiceRemote.mockClear();
	});

	it("brings back the configured replica count", async () => {
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "web-app",
			serverId: null,
			replicas: 3,
			modeSwarm: null,
		});

		await caller.start({ applicationId: "app-1" });

		expect(mocks.startService).toHaveBeenCalledWith("web-app", 3);
	});

	it("uses the remote server and an explicit replicated mode", async () => {
		mocks.findApplicationById.mockResolvedValue({
			applicationId: "app-1",
			appName: "web-app",
			serverId: "server-1",
			replicas: 1,
			modeSwarm: { Replicated: { Replicas: 4 } },
		});

		await caller.start({ applicationId: "app-1" });

		expect(mocks.startServiceRemote).toHaveBeenCalledWith(
			"server-1",
			"web-app",
			4,
		);
	});
});
