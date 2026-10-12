import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findServerById: vi.fn(),
	getRemoteDocker: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({ db: {} }));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
	findServersByOrganizationForLogManagement: vi.fn(),
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { removeVectorAgent } = await import(
	"@dokploy/server/setup/vector-setup"
);

describe("removeVectorAgent on a server without SSH key", () => {
	it("refuses instead of falling back to the local docker socket", async () => {
		mocks.findServerById.mockResolvedValue({
			serverId: "server-1",
			sshKeyId: null,
		});

		await expect(removeVectorAgent("server-1")).rejects.toThrow(/SSH key/);
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
