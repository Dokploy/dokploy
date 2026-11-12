import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServersByOrganizationForVectorAgent: vi.fn(),
	getWebServerSettings: vi.fn(),
	releaseWebServerAgent: vi.fn(),
	removeVectorAgent: vi.fn(),
	deleteWhere: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({ IS_CLOUD: false }));
vi.mock("@dokploy/server/db", () => ({
	db: { delete: () => ({ where: mocks.deleteWhere }) },
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServersByOrganizationForVectorAgent:
		mocks.findServersByOrganizationForVectorAgent,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
	releaseWebServerAgent: mocks.releaseWebServerAgent,
}));
vi.mock("@dokploy/server/setup/vector-setup", () => ({
	removeVectorAgent: mocks.removeVectorAgent,
	withVectorTargetLock: (_: string | undefined, fn: () => Promise<unknown>) =>
		fn(),
}));

const { deleteOrganization } = await import(
	"@dokploy/server/services/organization"
);

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.findServersByOrganizationForVectorAgent.mockResolvedValue([]);
	mocks.deleteWhere.mockResolvedValue({ count: 1 });
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteOrganization", () => {
	it("attempts cleanup on every server, even with an empty selection, and swallows errors", async () => {
		mocks.findServersByOrganizationForVectorAgent.mockResolvedValue([
			{ serverId: "server-1", telemetryProviderIds: ["lp-1"] },
			{ serverId: "server-2", telemetryProviderIds: ["lp-1"] },
			{ serverId: "server-3", telemetryProviderIds: [] },
		]);
		mocks.removeVectorAgent.mockImplementation(async (serverId?: string) => {
			if (serverId === "server-1") throw new Error("ssh down");
		});
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: null,
		});

		await deleteOrganization("org-a");

		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-1");
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-2");
		expect(mocks.removeVectorAgent).toHaveBeenCalledWith("server-3");
		expect(mocks.deleteWhere).toHaveBeenCalled();
	});

	it("leaves the local agent alone when another organization owns it", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-b",
		});

		await deleteOrganization("org-a");

		expect(mocks.removeVectorAgent).not.toHaveBeenCalled();
		expect(mocks.releaseWebServerAgent).not.toHaveBeenCalled();
	});

	it("releases the local agent even when removing it fails", async () => {
		mocks.getWebServerSettings.mockResolvedValue({
			vectorAgentOrganizationId: "org-a",
		});
		mocks.removeVectorAgent.mockRejectedValue(new Error("docker down"));

		await deleteOrganization("org-a");

		expect(mocks.removeVectorAgent).toHaveBeenCalledWith();
		expect(mocks.releaseWebServerAgent).toHaveBeenCalledWith("org-a");
		expect(mocks.deleteWhere).toHaveBeenCalled();
	});
});
