import {
	createRegistry,
	updateRegistry,
} from "@dokploy/server/services/registry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	execFileAsync: vi.fn(),
	update: vi.fn(),
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, IS_CLOUD: true };
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
	execFileAsync: mocks.execFileAsync,
}));

const row = {
	registryId: "registry-1",
	registryName: "Registry",
	username: "user",
	password: "secret",
	registryUrl: "registry.example.com",
	registryType: "cloud",
	organizationId: "org-1",
};

vi.mock("@dokploy/server/db", () => {
	const returning = () => Promise.resolve([row]);
	const tx = {
		insert: () => ({ values: () => ({ returning }) }),
	};
	return {
		db: {
			transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
			update: (...args: unknown[]) => {
				mocks.update(...args);
				return { set: () => ({ where: () => ({ returning }) }) };
			},
		},
	};
});

const input = {
	registryName: "Registry",
	username: "user",
	password: "secret",
	registryUrl: "registry.example.com",
	registryType: "cloud" as const,
	imagePrefix: null,
};

describe("registry login target in cloud", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("never logs the shared control plane in when no server is chosen", async () => {
		await createRegistry({ ...input, serverId: "none" }, "org-1");

		expect(mocks.execFileAsync).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("logs in on the selected server", async () => {
		await createRegistry({ ...input, serverId: "server-1" }, "org-1");

		expect(mocks.execAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			expect.stringContaining("docker login"),
			undefined,
			"secret",
		);
		expect(mocks.execFileAsync).not.toHaveBeenCalled();
	});

	it("does not touch the control plane on update with no server", async () => {
		await updateRegistry("registry-1", { serverId: "none" });

		expect(mocks.execFileAsync).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
	});

	it("rejects an update without a server before saving it", async () => {
		await expect(
			updateRegistry("registry-1", { registryName: "Renamed" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mocks.update).not.toHaveBeenCalled();
	});
});
