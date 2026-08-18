import {
	getContainersByAppNameMatch,
	getStackContainersByAppName,
} from "@dokploy/server/services/docker";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

const execAsyncMock = vi.mocked(execAsync);
const execAsyncRemoteMock = vi.mocked(execAsyncRemote);

describe("stack container lookup results", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("returns undefined when the native stack lookup fails", async () => {
		execAsyncMock.mockRejectedValueOnce(new Error("Docker is unavailable"));

		await expect(
			getContainersByAppNameMatch("farmgate-odoo", "stack"),
		).resolves.toBeUndefined();
	});

	it("returns an empty list for a successful native lookup with no tasks", async () => {
		execAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await expect(
			getContainersByAppNameMatch("farmgate-odoo", "stack"),
		).resolves.toEqual([]);
	});

	it("returns undefined when the remote native stack lookup fails", async () => {
		execAsyncRemoteMock.mockRejectedValueOnce(new Error("SSH is unavailable"));

		await expect(
			getContainersByAppNameMatch("farmgate-odoo", "stack", "server-1"),
		).resolves.toBeUndefined();
	});

	it("returns undefined when the Swarm stack lookup reports an error", async () => {
		execAsyncRemoteMock.mockResolvedValueOnce({
			stdout: "",
			stderr: "node is unavailable",
		});

		await expect(
			getStackContainersByAppName("farmgate-odoo", "server-1"),
		).resolves.toBeUndefined();
	});

	it("returns an empty list for a successful Swarm lookup with no tasks", async () => {
		execAsyncMock.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await expect(getStackContainersByAppName("farmgate-odoo")).resolves.toEqual(
			[],
		);
	});
});
