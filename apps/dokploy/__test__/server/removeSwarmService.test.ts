import { removeSwarmService } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execAsyncMock, execAsyncRemoteMock } = vi.hoisted(() => ({
	execAsyncMock: vi.fn(),
	execAsyncRemoteMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

describe("removeSwarmService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("removes exactly the requested service locally", async () => {
		execAsyncMock.mockResolvedValue({ stdout: "", stderr: "" });

		await removeSwarmService("abcdefghijklmnopqrstuvwxy");

		expect(execAsyncMock).toHaveBeenCalledWith(
			"docker service rm abcdefghijklmnopqrstuvwxy",
		);
		expect(execAsyncRemoteMock).not.toHaveBeenCalled();
	});

	it("dispatches removal to the selected remote server", async () => {
		execAsyncRemoteMock.mockResolvedValue({ stdout: "", stderr: "" });

		await removeSwarmService("abcdefghijklmnopqrstuvwxy", "server-456");

		expect(execAsyncRemoteMock).toHaveBeenCalledWith(
			"server-456",
			"docker service rm abcdefghijklmnopqrstuvwxy",
		);
		expect(execAsyncMock).not.toHaveBeenCalled();
	});

	it("rejects option-like input without calling an executor", async () => {
		await expect(removeSwarmService("--help")).rejects.toThrow(
			"Invalid Docker Swarm service ID: expected 25 lowercase alphanumeric characters.",
		);
		expect(execAsyncMock).not.toHaveBeenCalled();
		expect(execAsyncRemoteMock).not.toHaveBeenCalled();
	});

	it("propagates local command failures", async () => {
		const error = new Error("docker service rm failed");
		execAsyncMock.mockRejectedValue(error);

		await expect(removeSwarmService("abcdefghijklmnopqrstuvwxy")).rejects.toBe(
			error,
		);
	});
});
