import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	claimWebServerLogManagement: vi.fn(),
	updateServerLogProviders: vi.fn(),
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
	}));
	vi.doMock("@dokploy/server/services/web-server-settings", () => ({
		claimWebServerLogManagement: mocks.claimWebServerLogManagement,
	}));
	vi.doMock("@dokploy/server/setup/vector-setup", () => ({
		removeVectorAgent: mocks.removeVectorAgent,
		setupVectorAgent: mocks.setupVectorAgent,
	}));
	vi.doMock("@dokploy/server/services/log-management/service", () => ({
		assertServerBelongsToOrg: mocks.assertServerBelongsToOrg,
		assertLogProvidersBelongToOrg: mocks.assertLogProvidersBelongToOrg,
	}));
	return await import("@dokploy/server/services/log-management/vector-agent");
};

describe("local Vector agent guards", () => {
	beforeEach(() => {
		for (const mock of Object.values(mocks)) mock.mockReset();
	});

	it("does not remove the local agent when another organization owns it", async () => {
		mocks.claimWebServerLogManagement.mockResolvedValue(null);
		const { removeLogManagement } = await loadAgent(false);

		await expect(removeLogManagement("org-b", undefined)).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);
		expect(mocks.claimWebServerLogManagement).toHaveBeenCalledWith("org-b", []);
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
	});

	it("removes the local agent once the claim is released", async () => {
		mocks.claimWebServerLogManagement.mockResolvedValue({ id: "settings" });
		const { removeLogManagement } = await loadAgent(false);

		await removeLogManagement("org-a", undefined);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith();
	});

	it("rejects deploying the local agent in cloud", async () => {
		const { deployLogManagement } = await loadAgent(true);

		await expect(
			deployLogManagement("org-a", undefined, ["lp-1"]),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.claimWebServerLogManagement).not.toHaveBeenCalled();
		expect(mocks.setupVectorAgent).not.toHaveBeenCalled();
	});

	it("rejects removing the local agent in cloud", async () => {
		const { removeLogManagement } = await loadAgent(true);

		await expect(removeLogManagement("org-a", undefined)).rejects.toMatchObject(
			{ code: "BAD_REQUEST" },
		);
		expect(mocks.claimWebServerLogManagement).not.toHaveBeenCalled();
		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
	});

	it("still manages remote servers in cloud", async () => {
		const { removeLogManagement } = await loadAgent(true);

		await removeLogManagement("org-a", "server-1");
		expect(mocks.assertServerBelongsToOrg).toHaveBeenCalledWith(
			"server-1",
			"org-a",
		);
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
		expect(mocks.updateServerLogProviders).toHaveBeenCalledWith("server-1", []);
	});
});
