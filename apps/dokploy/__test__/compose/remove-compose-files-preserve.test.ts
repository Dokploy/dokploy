import { removeCompose } from "@dokploy/server/services/compose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

describe("removeCompose file preservation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("preserves files folder by only removing code directory when deleteVolumes is false", async () => {
		const compose = {
			appName: "test-app",
			composeType: "docker-compose",
			serverId: null,
		} as any;

		await removeCompose(compose, false);

		expect(mocks.execAsync).toHaveBeenCalled();
		const command = mocks.execAsync.mock.calls[0]![0];
		expect(command).toMatch(/rm -rf .*test-app[/\\]code/);
		expect(command).not.toContain("down --volumes");
	});

	it("removes entire project path when deleteVolumes is true", async () => {
		const compose = {
			appName: "test-app",
			composeType: "docker-compose",
			serverId: null,
		} as any;

		await removeCompose(compose, true);

		expect(mocks.execAsync).toHaveBeenCalled();
		const command = mocks.execAsync.mock.calls[0]![0];
		expect(command).toMatch(/rm -rf .*test-app$/m);
		expect(command).toContain("down --volumes");
	});
});
