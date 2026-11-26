import {
	startService,
	startServiceRemote,
} from "@dokploy/server/utils/docker/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execAsyncMock, execAsyncRemoteMock } = vi.hoisted(() => ({
	execAsyncMock: vi.fn(async () => ({ stdout: "", stderr: "" })),
	execAsyncRemoteMock: vi.fn(async () => ({ stdout: "", stderr: "" })),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
	execAsyncRemote: execAsyncRemoteMock,
}));

describe("startService", () => {
	beforeEach(() => {
		execAsyncMock.mockClear();
		execAsyncRemoteMock.mockClear();
	});

	it("restores the configured replica count instead of one", async () => {
		await startService("web-app", 3);

		expect(execAsyncMock).toHaveBeenCalledWith(
			"docker service scale web-app=3",
		);
	});

	it("restores the configured count on a remote server", async () => {
		await startServiceRemote("server-1", "web-app", 4);

		expect(execAsyncRemoteMock).toHaveBeenCalledWith(
			"server-1",
			"docker service scale web-app=4",
		);
	});

	it("still defaults to one replica for callers without a count", async () => {
		await startService("web-app");

		expect(execAsyncMock).toHaveBeenCalledWith(
			"docker service scale web-app=1",
		);
	});

	it("quotes the service name", async () => {
		await startService("web-app; rm -rf /", 2);

		expect(execAsyncMock).toHaveBeenCalledWith(
			"docker service scale 'web-app; rm -rf /'=2",
		);
	});

	it.each([-1, 1.5, Number.NaN])(
		"rejects an invalid count %s without running a command",
		async (replicas) => {
			await expect(startService("web-app", replicas)).rejects.toThrow(
				"Invalid replica count",
			);
			expect(execAsyncMock).not.toHaveBeenCalled();
		},
	);
});
