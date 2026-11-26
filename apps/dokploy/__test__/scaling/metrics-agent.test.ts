import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setupMonitoring: vi.fn(async () => undefined),
	setupWebMonitoring: vi.fn(async () => undefined),
	findServerById: vi.fn(),
	updateServerById: vi.fn(async () => undefined),
	getWebServerSettings: vi.fn(),
	updateWebServerSettings: vi.fn(async () => undefined),
}));

vi.mock("@dokploy/server/setup/monitoring-setup", () => ({
	setupMonitoring: mocks.setupMonitoring,
	setupWebMonitoring: mocks.setupWebMonitoring,
}));
vi.mock("@dokploy/server/services/admin", () => ({
	getDokployUrl: vi.fn(async () => "https://dokploy.example.com"),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	updateServerById: mocks.updateServerById,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
	updateWebServerSettings: mocks.updateWebServerSettings,
}));

const { installTaskMetricsAgent, withTaskMetricsEnabled } = await import(
	"@dokploy/server/services/scaling/metrics-agent"
);

type MetricsConfig = Parameters<typeof withTaskMetricsEnabled>[0];

const emptyConfig = {
	server: {
		type: "Remote",
		refreshRate: 60,
		port: 4500,
		token: "",
		urlCallback: "",
		cronJob: "",
		retentionDays: 2,
		thresholds: { cpu: 0, memory: 0 },
	},
	containers: { refreshRate: 60, services: { include: [], exclude: [] } },
} as MetricsConfig;

const defaults = { token: "generated", urlCallback: "https://d/cb" };

describe("withTaskMetricsEnabled", () => {
	it("fills the values the agent cannot start without", () => {
		expect(withTaskMetricsEnabled(emptyConfig, defaults)).toMatchObject({
			server: {
				token: "generated",
				urlCallback: "https://d/cb",
				cronJob: "0 0 * * *",
				port: 4500,
			},
			tasks: { enabled: true, refreshRate: 15, retentionHours: 24 },
		});
	});

	it("keeps every value already configured", () => {
		const configured = {
			...emptyConfig,
			server: {
				...emptyConfig.server,
				port: 4600,
				token: "existing",
				urlCallback: "https://other/cb",
				cronJob: "0 3 * * *",
				thresholds: { cpu: 80, memory: 90 },
			},
			containers: {
				refreshRate: 30,
				services: { include: ["api"], exclude: [] },
			},
			tasks: { enabled: false, refreshRate: 30, retentionHours: 6 },
		} as MetricsConfig;

		expect(withTaskMetricsEnabled(configured, defaults)).toEqual({
			...configured,
			tasks: { enabled: true, refreshRate: 30, retentionHours: 6 },
		});
	});
});

describe("installTaskMetricsAgent", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockClear();
	});

	it("configures and deploys the agent on the application's remote server", async () => {
		mocks.findServerById.mockResolvedValue({ metricsConfig: emptyConfig });

		await installTaskMetricsAgent({ serverId: "srv-1" });

		const [serverId, update] = mocks.updateServerById.mock
			.calls[0] as unknown as [string, { metricsConfig: MetricsConfig }];
		expect(serverId).toBe("srv-1");
		expect(update.metricsConfig.server.token).toMatch(/^[0-9a-f]{64}$/);
		expect(update.metricsConfig.server.urlCallback).toBe(
			"https://dokploy.example.com/api/trpc/notification.receiveNotification",
		);
		expect(mocks.setupMonitoring).toHaveBeenCalledWith("srv-1");
		expect(mocks.setupWebMonitoring).not.toHaveBeenCalled();
	});

	it("configures the Dokploy host for applications without a server", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			metricsConfig: emptyConfig,
		});

		await installTaskMetricsAgent({ serverId: null });

		expect(mocks.updateWebServerSettings).toHaveBeenCalledWith({
			metricsConfig: expect.objectContaining({
				tasks: expect.objectContaining({ enabled: true }),
			}),
		});
		expect(mocks.setupWebMonitoring).toHaveBeenCalled();
		expect(mocks.setupMonitoring).not.toHaveBeenCalled();
	});
});
