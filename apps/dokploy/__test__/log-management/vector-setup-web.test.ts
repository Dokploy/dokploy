import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getWebServerSettings: vi.fn(),
	hasEnabledLogProvider: vi.fn(),
	getService: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

vi.mock(
	"@dokploy/server/services/log-management/service",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/log-management/service")
		>()),
		hasEnabledLogProvider: mocks.hasEnabledLogProvider,
	}),
);

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn().mockResolvedValue({
		getService: mocks.getService,
	}),
}));

const { syncWebVectorAgent } = await import(
	"@dokploy/server/setup/vector-setup"
);

describe("syncWebVectorAgent — install condition", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("tears down (never installs) when the local toggle is off", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			enableLogManagement: false,
			logManagementOrganizationId: "org-1",
		});
		mocks.remove.mockResolvedValue(undefined);
		mocks.getService.mockReturnValue({ remove: mocks.remove });

		const result = await syncWebVectorAgent();

		expect(result.installed).toBe(false);
		expect(mocks.getService).toHaveBeenCalledWith("dokploy-vector");
		expect(mocks.remove).toHaveBeenCalled();
	});

	it("tears down when no organization has claimed the local agent yet", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			enableLogManagement: true,
			logManagementOrganizationId: null,
		});
		mocks.remove.mockResolvedValue(undefined);
		mocks.getService.mockReturnValue({ remove: mocks.remove });

		const result = await syncWebVectorAgent();

		expect(result.installed).toBe(false);
		expect(mocks.hasEnabledLogProvider).not.toHaveBeenCalled();
	});

	it("tears down when the owning organization has no enabled log provider", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			enableLogManagement: true,
			logManagementOrganizationId: "org-1",
		});
		mocks.hasEnabledLogProvider.mockResolvedValue(false);
		mocks.remove.mockResolvedValue(undefined);
		mocks.getService.mockReturnValue({ remove: mocks.remove });

		const result = await syncWebVectorAgent();

		expect(result.installed).toBe(false);
		expect(mocks.hasEnabledLogProvider).toHaveBeenCalledWith("org-1");
	});

	it("skips the hasEnabledLogProvider query when providers are already preloaded", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			enableLogManagement: true,
			logManagementOrganizationId: "org-1",
		});
		mocks.remove.mockResolvedValue(undefined);
		mocks.getService.mockReturnValue({ remove: mocks.remove });

		const result = await syncWebVectorAgent({ providers: [], lookup: {} });

		expect(result.installed).toBe(false);
		expect(mocks.hasEnabledLogProvider).not.toHaveBeenCalled();
	});
});
