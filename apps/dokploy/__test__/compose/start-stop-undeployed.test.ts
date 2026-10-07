import { startCompose, stopCompose } from "@dokploy/server/services/compose";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	existsSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs")>()),
	existsSync: mocks.existsSync,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: { compose: { findFirst: mocks.findFirst } },
		update: () => ({
			set: () => ({
				where: () => ({ returning: async () => [{}] }),
			}),
		}),
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class ExecError extends Error {},
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));


const compose = (overrides: Record<string, unknown> = {}) => ({
	composeId: "c1",
	appName: "my-app",
	composeType: "docker-compose",
	sourceType: "github",
	composePath: "./docker-compose.yml",
	serverId: null,
	...overrides,
});

const expectNotDeployed = async (promise: Promise<unknown>, verb: string) => {
	const error = await promise.then(
		() => null,
		(e) => e,
	);
	expect(error).toBeInstanceOf(TRPCError);
	expect(error.code).toBe("BAD_REQUEST");
	expect(error.message).toBe(
		`This compose hasn't been deployed yet, so there is nothing to ${verb}. Deploy it first.`,
	);
};

describe("startCompose / stopCompose on a never-deployed compose", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("start: local missing directory throws BAD_REQUEST without exec", async () => {
		mocks.findFirst.mockResolvedValue(compose());
		mocks.existsSync.mockReturnValue(false);

		await expectNotDeployed(startCompose("c1"), "start");
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("start: local existing directory runs docker compose up", async () => {
		mocks.findFirst.mockResolvedValue(compose());
		mocks.existsSync.mockReturnValue(true);

		await expect(startCompose("c1")).resolves.toBe(true);
		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync.mock.calls[0]?.[0]).toContain("up -d");
	});

	it("stop: local missing directory throws BAD_REQUEST without exec", async () => {
		mocks.findFirst.mockResolvedValue(compose());
		mocks.existsSync.mockReturnValue(false);

		await expectNotDeployed(stopCompose("c1"), "stop");
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("stop: local existing directory runs docker compose stop", async () => {
		mocks.findFirst.mockResolvedValue(compose());
		mocks.existsSync.mockReturnValue(true);

		await expect(stopCompose("c1")).resolves.toBe(true);
		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync.mock.calls[0]?.[0]).toContain("compose -p my-app stop");
	});

	it("start: remote failing test -d throws BAD_REQUEST without running compose", async () => {
		mocks.findFirst.mockResolvedValue(compose({ serverId: "s1" }));
		mocks.execAsyncRemote.mockRejectedValueOnce(new Error("exit 1"));

		await expectNotDeployed(startCompose("c1"), "start");
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
		expect(mocks.execAsyncRemote.mock.calls[0]?.[1]).toMatch(/^test -d .*code/);
	});

	it("stop: remote failing test -d throws BAD_REQUEST without running compose", async () => {
		mocks.findFirst.mockResolvedValue(compose({ serverId: "s1" }));
		mocks.execAsyncRemote.mockRejectedValueOnce(new Error("exit 1"));

		await expectNotDeployed(stopCompose("c1"), "stop");
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(1);
	});

	it("start: remote existing directory proceeds to docker compose up", async () => {
		mocks.findFirst.mockResolvedValue(compose({ serverId: "s1" }));

		await expect(startCompose("c1")).resolves.toBe(true);
		expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
		expect(mocks.execAsyncRemote.mock.calls[1]?.[1]).toContain("up -d");
	});
});
