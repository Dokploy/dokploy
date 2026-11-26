import { beforeEach, describe, expect, it, vi } from "vitest";

const { execAsync, execAsyncRemote } = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync,
	execAsyncRemote,
}));

import { removeRailpackBuilder } from "@dokploy/server/utils/docker/utils";

describe("removeRailpackBuilder", () => {
	beforeEach(() => {
		execAsync.mockReset();
		execAsyncRemote.mockReset();
	});

	it("removes the app builder on the server that built it", async () => {
		await removeRailpackBuilder("my-app", "build-server-1");

		expect(execAsyncRemote).toHaveBeenCalledWith(
			"build-server-1",
			"docker buildx rm railpack-my-app",
		);
		expect(execAsync).not.toHaveBeenCalled();
	});

	it("removes the builder locally when there is no remote server", async () => {
		await removeRailpackBuilder("my-app", null);

		expect(execAsync).toHaveBeenCalledWith("docker buildx rm railpack-my-app");
	});

	it("does not throw when the builder does not exist", async () => {
		execAsync.mockRejectedValue(new Error("no builder"));

		await expect(removeRailpackBuilder("my-app")).resolves.toBeInstanceOf(
			Error,
		);
	});
});
