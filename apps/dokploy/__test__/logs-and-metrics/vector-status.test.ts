import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listTasks: vi.fn(),
	inspectService: vi.fn(),
	findServersByOrganizationForVectorAgent: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getWebServerSettings: vi.fn(),
	findTelemetryProvidersByOrganization: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ VECTOR_PATH: "/etc/dokploy/vector" }),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
	findServersByOrganizationForVectorAgent:
		mocks.findServersByOrganizationForVectorAgent,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));
vi.mock(
	"@dokploy/server/services/logs-and-metrics/service",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/services/logs-and-metrics/service")
		>()),
		findTelemetryProvidersByOrganization:
			mocks.findTelemetryProvidersByOrganization,
	}),
);
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => ({
		listTasks: mocks.listTasks,
		getService: () => ({ inspect: mocks.inspectService }),
	}),
}));

const { getVectorAgentTargets, withVectorTargetLock } = await import(
	"@dokploy/server/setup/vector-setup"
);

const session = { userId: "user-1", activeOrganizationId: "org-1" };

describe("getVectorAgentTargets", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.findServersByOrganizationForVectorAgent.mockResolvedValue([]);
		mocks.inspectService.mockResolvedValue({});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set());
		mocks.findTelemetryProvidersByOrganization.mockResolvedValue([
			{ telemetryProviderId: "lp-1", enabled: true, signals: ["logs"] },
			{ telemetryProviderId: "mp-1", enabled: true, signals: ["metrics"] },
			{ telemetryProviderId: "mp-off", enabled: false, signals: ["metrics"] },
		]);
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-1",
			telemetryProviderIds: ["lp-1"],
		});
	});

	it("requires a running cAdvisor task when the target ships metrics", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-1",
			telemetryProviderIds: ["mp-1"],
		});
		mocks.listTasks.mockImplementation(
			async ({ filters }: { filters: string }) =>
				JSON.parse(filters).service[0] === "dokploy-vector"
					? [{ Status: { State: "running" } }]
					: [],
		);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("not-running");
		expect(mocks.listTasks).toHaveBeenCalledTimes(2);
	});

	it("reports running when both Vector and cAdvisor have a running task", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-1",
			telemetryProviderIds: ["mp-1"],
		});
		mocks.listTasks.mockResolvedValue([{ Status: { State: "running" } }]);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("running");
	});

	it("does not look at cAdvisor for a logs-only target", async () => {
		mocks.listTasks.mockResolvedValue([{ Status: { State: "running" } }]);

		await getVectorAgentTargets(session);
		expect(mocks.listTasks).toHaveBeenCalledTimes(1);
	});

	it("does not look at cAdvisor when the only metrics provider is disabled", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-1",
			telemetryProviderIds: ["lp-1", "mp-off"],
		});
		mocks.listTasks.mockResolvedValue([{ Status: { State: "running" } }]);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("running");
		expect(mocks.listTasks).toHaveBeenCalledTimes(1);
	});

	it("reports running only when a task of the service is running", async () => {
		mocks.listTasks.mockResolvedValue([{ Status: { State: "running" } }]);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("running");
		expect(mocks.listTasks).toHaveBeenCalledWith({
			filters: JSON.stringify({
				service: ["dokploy-vector"],
				"desired-state": ["running"],
			}),
		});
	});

	it("reports not-running when the service has no running task", async () => {
		mocks.listTasks.mockResolvedValue([{ Status: { State: "pending" } }]);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("not-running");
	});

	it("reports stopped when the service does not exist", async () => {
		mocks.inspectService.mockRejectedValue(
			Object.assign(new Error("not found"), { statusCode: 404 }),
		);
		mocks.listTasks.mockResolvedValue([]);

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("stopped");
		expect(mocks.listTasks).not.toHaveBeenCalled();
	});

	it("reports unknown on any other docker error", async () => {
		mocks.inspectService.mockRejectedValue(new Error("connect ECONNREFUSED"));

		const [local] = await getVectorAgentTargets(session);
		expect(local?.status).toBe("unknown");
	});

	it("reports an empty selection for an unowned local host, even with ids left by a deleted organization", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: null,
			telemetryProviderIds: ["lp-from-deleted-org", "mp-from-deleted-org"],
		});
		mocks.listTasks.mockResolvedValue([]);

		const [local] = await getVectorAgentTargets(session);
		expect(local).toMatchObject({
			serverId: null,
			telemetryProviderIds: [],
		});
	});

	it("hides servers the member cannot access", async () => {
		mocks.listTasks.mockResolvedValue([]);
		mocks.findServersByOrganizationForVectorAgent.mockResolvedValue([
			{
				serverId: "server-1",
				name: "one",
				ipAddress: "1.1.1.1",
				telemetryProviderIds: [],
			},
			{
				serverId: "server-2",
				name: "two",
				ipAddress: "2.2.2.2",
				telemetryProviderIds: [],
			},
		]);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		const targets = await getVectorAgentTargets(session);
		expect(targets.map((t) => t.serverId)).toEqual([null, "server-2"]);
	});
});

describe("withVectorTargetLock", () => {
	it("runs operations on the same target one after another", async () => {
		const events: string[] = [];
		let releaseFirst = () => {};
		const first = withVectorTargetLock("server-1", async () => {
			events.push("first:start");
			await new Promise<void>((resolve) => {
				releaseFirst = resolve;
			});
			events.push("first:end");
			throw new Error("first failed");
		});
		const second = withVectorTargetLock("server-1", async () => {
			events.push("second");
		});
		const other = withVectorTargetLock("server-2", async () => {
			events.push("other");
		});

		await other;
		expect(events).toEqual(["first:start", "other"]);
		releaseFirst();
		await expect(first).rejects.toThrow("first failed");
		await second;
		expect(events).toEqual(["first:start", "other", "first:end", "second"]);
	});
});
