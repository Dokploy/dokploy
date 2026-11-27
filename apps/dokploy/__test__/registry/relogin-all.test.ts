import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	execFile: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { registry: { findMany: mocks.findMany } } },
}));
vi.mock("@dokploy/server/constants", () => ({ IS_CLOUD: false }));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	execFileAsync: mocks.execFile,
}));

import { reloginAllRegistries } from "@dokploy/server/services/registry";

describe("reloginAllRegistries", () => {
	beforeEach(() => vi.clearAllMocks());

	it("logs in to each stored registry and tolerates failures", async () => {
		mocks.findMany.mockResolvedValue([
			{
				registryName: "a",
				registryUrl: "ghcr.io",
				username: "u1",
				password: "p1",
			},
			{ registryName: "b", registryUrl: "", username: "u2", password: "p2" },
		]);
		mocks.execFile
			.mockRejectedValueOnce(new Error("denied p1"))
			.mockResolvedValueOnce(undefined);
		const logs: string[] = [];
		const result = await reloginAllRegistries((l) => logs.push(l));
		expect(result).toEqual({ succeeded: 1, failed: 1 });
		expect(mocks.execFile).toHaveBeenCalledWith(
			"docker",
			["login", "ghcr.io", "--username", "u1", "--password-stdin"],
			{ input: "p1" },
		);
		expect(logs.some((l) => l.includes("Warning"))).toBe(true);
	});
});
