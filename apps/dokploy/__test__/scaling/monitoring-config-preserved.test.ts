import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getWebServerSettings: vi.fn(),
	updateWebServerSettings: vi.fn(async () => undefined),
	setupWebMonitoring: vi.fn(async () => undefined),
	findServerById: vi.fn(),
	updateServerById: vi.fn(async () => undefined),
	setupMonitoring: vi.fn(async () => ({})),
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	getWebServerSettings: mocks.getWebServerSettings,
	updateWebServerSettings: mocks.updateWebServerSettings,
	setupWebMonitoring: mocks.setupWebMonitoring,
	findServerById: mocks.findServerById,
	updateServerById: mocks.updateServerById,
	setupMonitoring: mocks.setupMonitoring,
}));
vi.mock("@dokploy/server/lib/auth", () => ({ validateRequest: vi.fn() }));
vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
}));

const { adminRouter } = await import("@/server/api/routers/admin");
const { serverRouter } = await import("@/server/api/routers/server");

const ctx = {
	session: { activeOrganizationId: "org-1" },
	user: { id: "user-1", email: "owner@example.com", role: "owner" },
};

const tasks = { enabled: true, refreshRate: 15, retentionHours: 24 };

const metricsConfig = {
	server: {
		refreshRate: 60,
		port: 4500,
		token: "t",
		urlCallback: "https://d/cb",
		retentionDays: 2,
		cronJob: "0 0 * * *",
		thresholds: { cpu: 80, memory: 80 },
	},
	containers: { refreshRate: 60, services: { include: [], exclude: [] } },
};

describe("monitoring settings forms", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockClear();
	});

	it("keep replica collection on when the Dokploy host form is saved", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			metricsConfig: { ...metricsConfig, tasks },
		});

		await adminRouter
			.createCaller(ctx as never)
			.setupMonitoring({ metricsConfig } as never);

		expect(mocks.updateWebServerSettings).toHaveBeenCalledWith({
			metricsConfig: expect.objectContaining({ tasks }),
		});
	});

	it("keep replica collection on when a remote server form is saved", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "srv-1",
			name: "edge",
			organizationId: "org-1",
			metricsConfig: { ...metricsConfig, tasks },
		});

		await serverRouter
			.createCaller(ctx as never)
			.setupMonitoring({ serverId: "srv-1", metricsConfig } as never);

		expect(mocks.updateServerById).toHaveBeenCalledWith("srv-1", {
			metricsConfig: expect.objectContaining({ tasks }),
		});
	});
});
