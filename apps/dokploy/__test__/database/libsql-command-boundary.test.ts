import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	docker: {
		getContainer: vi.fn(() => ({
			inspect: vi.fn(),
		})),
	},
	paths: vi.fn(() => ({})),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { apiCreateLibsql } = await import("@dokploy/server/db/schema");
const { getContainerLogs } = await import("@dokploy/server/services/docker");
const { removeService, startService, stopService } = await import(
	"@dokploy/server/utils/docker/utils"
);

const safeCreateLibsqlInput = {
	name: "prod libsql",
	appName: "libsql-prod",
	dockerImage: "ghcr.io/tursodatabase/libsql-server:v0.24.32",
	environmentId: "environment-1",
	description: null,
	databaseUser: "libsql",
	databasePassword: "SafePassword123",
	sqldNode: "primary" as const,
	sqldPrimaryUrl: null,
	enableNamespaces: false,
	serverId: null,
};

describe("LibSQL Docker command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects unsafe LibSQL app names at the API schema boundary", () => {
		expect(
			apiCreateLibsql.safeParse({
				...safeCreateLibsqlInput,
				appName: "libsql-prod; touch /tmp/pwn",
			}).success,
		).toBe(false);

		expect(apiCreateLibsql.safeParse(safeCreateLibsqlInput).success).toBe(true);
	});

	it("quotes stored app names before Docker lifecycle shell commands", async () => {
		const unsafeAppName = "libsql-prod; touch /tmp/pwn";
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });

		await expect(startService(unsafeAppName)).resolves.toBeUndefined();
		await expect(stopService(unsafeAppName)).resolves.toBeUndefined();
		await expect(removeService(unsafeAppName)).resolves.toBeUndefined();

		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			1,
			"docker service scale 'libsql-prod; touch /tmp/pwn'=1 ",
		);
		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			2,
			"docker service scale 'libsql-prod; touch /tmp/pwn'=0 ",
		);
		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			3,
			"docker service rm 'libsql-prod; touch /tmp/pwn'",
		);
	});

	it("quotes stored app names before Docker log lookup shell commands", async () => {
		mocks.execAsync
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "service-123\n", stderr: "" })
			.mockResolvedValueOnce({ stdout: "filtered logs", stderr: "" });

		await expect(
			getContainerLogs("libsql-prod; touch /tmp/pwn", 10, "1m", "error's"),
		).resolves.toBe("filtered logs");

		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			1,
			"docker ps -q --filter 'name=^libsql-prod; touch /tmp/pwn' | head -1",
		);
		expect(mocks.execAsync).toHaveBeenNthCalledWith(
			2,
			"docker service ls -q --filter 'name=libsql-prod; touch /tmp/pwn' | head -1",
		);
		expect(mocks.execAsync.mock.calls[2]?.[0]).toContain(
			"docker service logs --timestamps --raw --tail 10 --since 1m service-123",
		);
		expect(mocks.execAsync.mock.calls[2]?.[0]).toContain('grep -iF "error\'s"');
	});
});
