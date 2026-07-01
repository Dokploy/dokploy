import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deployPostgres: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	findPostgres: vi.fn(),
	removeService: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			postgres: {
				findFirst: mocks.findPostgres,
			},
		},
	},
}));

vi.mock("@dokploy/server/services/postgres", () => ({
	deployPostgres: mocks.deployPostgres,
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: mocks.removeService,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { rebuildDatabase } = await import(
	"@dokploy/server/utils/databases/rebuild"
);

describe("database rebuild command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deployPostgres.mockResolvedValue(undefined);
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.removeService.mockResolvedValue(undefined);
	});

	it("rejects unsafe stored volume names before docker volume rm", async () => {
		mocks.findPostgres.mockResolvedValue({
			appName: "postgres-one",
			serverId: null,
			mounts: [
				{
					type: "volume",
					volumeName: "postgres-data; touch /tmp/pwn",
				},
			],
		});

		await expect(rebuildDatabase("postgres-1", "postgres", 0)).rejects.toThrow(
			"Invalid Docker volume name",
		);

		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("builds docker volume rm as quoted shell args", async () => {
		mocks.findPostgres.mockResolvedValue({
			appName: "postgres-one",
			serverId: "server-1",
			mounts: [
				{
					type: "volume",
					volumeName: "postgres-data.1",
				},
			],
		});

		await expect(rebuildDatabase("postgres-1", "postgres", 0)).resolves.toBe(
			undefined,
		);

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			"docker volume rm postgres-data.1 --force",
		);
	});
});
