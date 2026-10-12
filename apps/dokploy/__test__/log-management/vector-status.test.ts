import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listTasks: vi.fn(),
	inspectService: vi.fn(),
	findServersByOrganizationForLogManagement: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: () => ({ VECTOR_PATH: "/etc/dokploy/vector" }),
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
	findServersByOrganizationForLogManagement:
		mocks.findServersByOrganizationForLogManagement,
	getAccessibleServerIds: mocks.getAccessibleServerIds,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => ({
		listTasks: mocks.listTasks,
		getService: () => ({ inspect: mocks.inspectService }),
	}),
}));

const { getLogManagementServerStatus, withVectorTargetLock } = await import(
	"@dokploy/server/setup/vector-setup"
);

const session = { userId: "user-1", activeOrganizationId: "org-1" };

describe("getLogManagementServerStatus", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.findServersByOrganizationForLogManagement.mockResolvedValue([]);
		mocks.inspectService.mockResolvedValue({});
		mocks.getAccessibleServerIds.mockResolvedValue(new Set());
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-1",
			logProviderIds: ["lp-1"],
		});
	});

	it("reports running only when a task of the service is running", async () => {
		mocks.listTasks.mockResolvedValue([{ Status: { State: "running" } }]);

		const [local] = await getLogManagementServerStatus(session);
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

		const [local] = await getLogManagementServerStatus(session);
		expect(local?.status).toBe("not-running");
	});

	it("reports stopped when the service does not exist", async () => {
		mocks.inspectService.mockRejectedValue(
			Object.assign(new Error("not found"), { statusCode: 404 }),
		);
		mocks.listTasks.mockResolvedValue([]);

		const [local] = await getLogManagementServerStatus(session);
		expect(local?.status).toBe("stopped");
		expect(mocks.listTasks).not.toHaveBeenCalled();
	});

	it("reports unknown on any other docker error", async () => {
		mocks.inspectService.mockRejectedValue(new Error("connect ECONNREFUSED"));

		const [local] = await getLogManagementServerStatus(session);
		expect(local?.status).toBe("unknown");
	});

	it("hides servers the member cannot access", async () => {
		mocks.listTasks.mockResolvedValue([]);
		mocks.findServersByOrganizationForLogManagement.mockResolvedValue([
			{ serverId: "server-1", name: "one", ipAddress: "1.1.1.1" },
			{ serverId: "server-2", name: "two", ipAddress: "2.2.2.2" },
		]);
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		const targets = await getLogManagementServerStatus(session);
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
