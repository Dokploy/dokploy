import { beforeEach, describe, expect, it, vi } from "vitest";

const execMocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execMocks.execAsync,
	execAsyncRemote: execMocks.execAsyncRemote,
}));

const { getNodeInfo } = await import("@dokploy/server/services/docker");

describe("getNodeInfo command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		execMocks.execAsync.mockResolvedValue({
			stderr: "",
			stdout: JSON.stringify({ ID: "node-1" }),
		});
		execMocks.execAsyncRemote.mockResolvedValue({
			stderr: "",
			stdout: JSON.stringify({ ID: "node-1" }),
		});
	});

	it("rejects unsafe node identifiers before local shell execution", async () => {
		await expect(getNodeInfo("node-1;id")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		expect(execMocks.execAsync).not.toHaveBeenCalled();
		expect(execMocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("uses a safe node identifier in local docker inspect commands", async () => {
		await expect(getNodeInfo("node-1")).resolves.toEqual({ ID: "node-1" });

		expect(execMocks.execAsync).toHaveBeenCalledWith(
			"docker node inspect node-1 --format '{{json .}}'",
		);
		expect(execMocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("uses a safe node identifier in remote docker inspect commands", async () => {
		await expect(getNodeInfo("node.name-1", "server-1")).resolves.toEqual({
			ID: "node-1",
		});

		expect(execMocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"docker node inspect node.name-1 --format '{{json .}}'",
		);
		expect(execMocks.execAsync).not.toHaveBeenCalled();
	});
});
