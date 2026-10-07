import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claimWebServerLogManagement: vi.fn(),
	releaseWebServerLogManagement: vi.fn(),
	getWebServerSettings: vi.fn(),
	updateServerLogProviders: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	removeVectorAgent: vi.fn(),
	setupVectorAgent: vi.fn(),
	assertServerBelongsToOrg: vi.fn(),
	assertLogProvidersBelongToOrg: vi.fn(),
}));

const loadAgent = async (isCloud: boolean) => {
	vi.resetModules();
	vi.doMock("@dokploy/server/constants", () => ({ IS_CLOUD: isCloud }));
	vi.doMock("@dokploy/server/services/server", () => ({
		updateServerLogProviders: mocks.updateServerLogProviders,
		getAccessibleServerIds: mocks.getAccessibleServerIds,
	}));
	vi.doMock("@dokploy/server/services/web-server-settings", () => ({
		claimWebServerLogManagement: mocks.claimWebServerLogManagement,
		releaseWebServerLogManagement: mocks.releaseWebServerLogManagement,
		getWebServerSettings: mocks.getWebServerSettings,
	}));
	vi.doMock("@dokploy/server/setup/vector-setup", () => ({
		removeVectorAgent: mocks.removeVectorAgent,
		setupVectorAgent: mocks.setupVectorAgent,
		withVectorTargetLock: (_: string | undefined, fn: () => Promise<unknown>) =>
			fn(),
	}));
	vi.doMock("@dokploy/server/services/log-management/service", () => ({
		assertServerBelongsToOrg: mocks.assertServerBelongsToOrg,
		assertLogProvidersBelongToOrg: mocks.assertLogProvidersBelongToOrg,
	}));
	return await import("@dokploy/server/services/log-management/vector-agent");
};

const sessionA = { userId: "user-a", activeOrganizationId: "org-a" };
const sessionB = { userId: "user-b", activeOrganizationId: "org-b" };

describe("local Vector agent guards", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	});

	it("does not remove the local agent when another organization owns it", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
		});
		const { removeLogManagement } = await loadAgent(false);

		await expect(
			removeLogManagement(sessionB, undefined),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
		expect(mocks.releaseWebServerLogManagement).not.toHaveBeenCalled();
	});

	it("removes the local agent and only then releases the claim", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
		});
		const { removeLogManagement } = await loadAgent(false);

		await removeLogManagement(sessionA, undefined);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith();
		expect(mocks.releaseWebServerLogManagement).toHaveBeenCalledWith("org-a");
		expect(mocks.removeVectorAgent.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.releaseWebServerLogManagement.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("keeps the claim when removing the local agent fails", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
		});
		mocks.removeVectorAgent.mockRejectedValue(new Error("docker down"));
		const { removeLogManagement } = await loadAgent(false);

		await expect(removeLogManagement(sessionA, undefined)).rejects.toThrow(
			"docker down",
		);
		expect(mocks.releaseWebServerLogManagement).not.toHaveBeenCalled();
	});

	it("removes an unclaimed local agent", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: null,
		});
		const { removeLogManagement } = await loadAgent(false);

		await removeLogManagement(sessionA, undefined);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith();
	});

	it("rejects deploying the local agent in cloud", async () => {
		const { deployLogManagement } = await loadAgent(true);

		await expect(
			deployLogManagement(sessionA, undefined, ["lp-1"]),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.claimWebServerLogManagement).not.toHaveBeenCalled();
		expect(mocks.setupVectorAgent).not.toHaveBeenCalled();
	});

	it("rejects removing the local agent in cloud", async () => {
		const { removeLogManagement } = await loadAgent(true);

		await expect(
			removeLogManagement(sessionA, undefined),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.getWebServerSettings).not.toHaveBeenCalled();
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
	});

	it("still manages remote servers in cloud", async () => {
		const { removeLogManagement } = await loadAgent(true);

		await removeLogManagement(sessionA, "server-1");
		expect(mocks.assertServerBelongsToOrg).toHaveBeenCalledWith(
			"server-1",
			"org-a",
		);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
		expect(mocks.updateServerLogProviders).toHaveBeenCalledWith("server-1", []);
	});
});

describe("remote server access", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	});

	it("rejects deploying on a server the member cannot access", async () => {
		const { deployLogManagement } = await loadAgent(false);

		await expect(
			deployLogManagement(sessionA, "server-2", ["lp-1"]),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.getAccessibleServerIds).toHaveBeenCalledWith(sessionA);
		expect(mocks.updateServerLogProviders).not.toHaveBeenCalled();
		expect(mocks.setupVectorAgent).not.toHaveBeenCalled();
	});

	it("rejects removing from a server the member cannot access", async () => {
		const { removeLogManagement } = await loadAgent(false);

		await expect(
			removeLogManagement(sessionA, "server-2"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
	});

	it("deploys on an accessible server", async () => {
		const { deployLogManagement } = await loadAgent(false);

		await deployLogManagement(sessionA, "server-1", ["lp-1"]);
		expect(mocks.updateServerLogProviders).toHaveBeenCalledWith("server-1", [
			"lp-1",
		]);
		expect(mocks.setupVectorAgent).toHaveBeenCalledWith("org-a", "server-1", [
			"lp-1",
		]);
	});

	it("keeps the saved providers when the server deploy fails", async () => {
		mocks.setupVectorAgent.mockRejectedValue(new Error("validation failed"));
		const { deployLogManagement } = await loadAgent(false);

		await expect(
			deployLogManagement(sessionA, "server-1", ["lp-2"]),
		).rejects.toThrow("validation failed");
		expect(mocks.updateServerLogProviders).not.toHaveBeenCalled();
	});

	it("removes the agent on server deletion even with no providers left", async () => {
		const { removeServerLogManagement } = await loadAgent(false);

		await removeServerLogManagement({
			serverId: "server-1",
			sshKeyId: "key-1",
			logProviderIds: [],
		} as never);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
	});
});

describe("local agent deploy", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
		mocks.claimWebServerLogManagement.mockResolvedValue({});
	});

	it("saves the new providers only after the deploy succeeds", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
			logProviderIds: ["lp-1"],
		});
		const { deployLogManagement } = await loadAgent(false);

		await deployLogManagement(sessionA, undefined, ["lp-2"]);
		expect(mocks.claimWebServerLogManagement).toHaveBeenNthCalledWith(
			1,
			"org-a",
			["lp-1"],
		);
		expect(mocks.claimWebServerLogManagement).toHaveBeenNthCalledWith(
			2,
			"org-a",
			["lp-2"],
		);
		expect(mocks.setupVectorAgent.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.claimWebServerLogManagement.mock.invocationCallOrder[1] ?? 0,
		);
	});

	it("keeps the previous providers when a redeploy fails", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
			logProviderIds: ["lp-1"],
		});
		mocks.setupVectorAgent.mockRejectedValue(new Error("validation failed"));
		const { deployLogManagement } = await loadAgent(false);

		await expect(
			deployLogManagement(sessionA, undefined, ["lp-2"]),
		).rejects.toThrow("validation failed");
		expect(mocks.claimWebServerLogManagement).toHaveBeenCalledTimes(1);
		expect(mocks.claimWebServerLogManagement).toHaveBeenCalledWith("org-a", [
			"lp-1",
		]);
		expect(mocks.releaseWebServerLogManagement).not.toHaveBeenCalled();
	});

	it("releases the claim when the first local deploy fails", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: null,
			logProviderIds: [],
		});
		mocks.setupVectorAgent.mockRejectedValue(new Error("validation failed"));
		const { deployLogManagement } = await loadAgent(false);

		await expect(
			deployLogManagement(sessionA, undefined, ["lp-1"]),
		).rejects.toThrow("validation failed");
		expect(mocks.releaseWebServerLogManagement).toHaveBeenCalledWith("org-a");
	});

	it("rejects deploying when another organization owns the local agent", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			logManagementOrganizationId: "org-a",
			logProviderIds: ["lp-1"],
		});
		mocks.claimWebServerLogManagement.mockResolvedValue(null);
		const { deployLogManagement } = await loadAgent(false);

		await expect(
			deployLogManagement(sessionB, undefined, ["lp-9"]),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mocks.setupVectorAgent).not.toHaveBeenCalled();
	});
});
