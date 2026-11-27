import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	record: {} as Record<string, unknown>,
	deleted: false,
	deleteDroplet: vi.fn(),
	getDroplet: vi.fn(),
	runAction: vi.fn(),
	getAction: vi.fn(),
	serverSetup: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const db = {
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: () => {
					Object.assign(mocks.record, values);
					return Object.assign(Promise.resolve(), {
						returning: async () => [mocks.record],
					});
				},
			}),
		}),
		delete: () => ({
			where: async () => {
				mocks.deleted = true;
			},
		}),
		query: { cloudServer: { findFirst: async () => mocks.record } },
		execute: async () => undefined,
		transaction: (run: (tx: unknown) => unknown) => run(db),
	};
	return { db };
});

vi.mock("@dokploy/server/utils/digitalocean", () => ({
	getCloudServerTag: (id: string) => `dokploy-cs:${id}`,
	getPublicIPv4: () => "203.0.113.10",
	createDigitalOceanSshKey: async () => 1,
	deleteDigitalOceanSshKey: async () => undefined,
	createDigitalOceanDroplet: async () => ({ id: 123, name: "dokploy-abc" }),
	getDigitalOceanDroplet: mocks.getDroplet,
	deleteDigitalOceanDroplet: mocks.deleteDroplet,
	deleteDigitalOceanDropletsByTag: async () => undefined,
	resizeDigitalOceanDroplet: async () => ({ id: 1 }),
	runDigitalOceanDropletAction: mocks.runAction,
	getDigitalOceanDropletAction: mocks.getAction,
}));
vi.mock("@dokploy/server/services/server", () => ({
	createServer: async () => ({ serverId: "server-1" }),
}));
vi.mock("@dokploy/server/services/ssh-key", () => ({
	createSshKey: async () => ({ sshKeyId: "key-1" }),
}));
vi.mock("@dokploy/server/services/deployment", () => ({}));
vi.mock("@dokploy/server/setup/server-setup", () => ({
	serverSetup: mocks.serverSetup,
}));
vi.mock("@dokploy/server/utils/filesystem/ssh", () => ({
	generateSSHKey: async () => ({ publicKey: "pub", privateKey: "priv" }),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: async () => undefined,
}));

const { provisionCloudServer, resizeCloudServerVm, terminateCloudServer } =
	await import("@dokploy/server/services/cloud-server");

type Record_ = Parameters<typeof resizeCloudServerVm>[0];

const settle = async <T>(promise: Promise<T>) => {
	const outcome = promise.then(
		(value) => ({ value }),
		(error: Error) => ({ error }),
	);
	await vi.runAllTimersAsync();
	return outcome;
};

describe("cloud server lifecycle", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		for (const mock of Object.values(mocks)) {
			if (typeof mock === "function") mock.mockReset();
		}
		mocks.deleted = false;
		mocks.record = {
			cloudServerId: "cs-1",
			status: "ready",
			providerVmId: "123",
			providerVpcId: "vpc-1",
		};
		mocks.getDroplet.mockResolvedValue({ status: "active" });
		mocks.deleteDroplet.mockResolvedValue(undefined);
		mocks.runAction.mockResolvedValue({ id: 1 });
		mocks.getAction.mockResolvedValue({ status: "completed" });
		mocks.serverSetup.mockResolvedValue(true);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps the record when DigitalOcean fails to delete the droplet", async () => {
		mocks.deleteDroplet.mockRejectedValue(
			Object.assign(new Error("DigitalOcean is down"), {
				response: { status: 500 },
			}),
		);

		const outcome = await settle(terminateCloudServer("cs-1"));

		expect(outcome).toHaveProperty("error");
		expect(mocks.deleted).toBe(false);
	});

	it("removes the record once the droplet is gone", async () => {
		await settle(terminateCloudServer("cs-1"));

		expect(mocks.deleteDroplet).toHaveBeenCalledWith("123");
		expect(mocks.deleted).toBe(true);
	});

	it("fails the provisioning when the server setup fails", async () => {
		mocks.serverSetup.mockResolvedValue(false);

		const outcome = await settle(
			provisionCloudServer({
				cloudServerId: "cs-1",
				organizationId: "org-1",
				doSize: "s-1vcpu-2gb-intel",
				swapGb: 2,
				zone: "sfo2",
				hostname: "dokploy-abc",
			}),
		);

		expect(outcome).toHaveProperty("error.message", "Server setup failed");
		expect(mocks.record.status).not.toBe("ready");
	});

	it("does not fail an upgrade whose resize finished but could not power back on", async () => {
		mocks.getDroplet.mockResolvedValue({ status: "off" });
		mocks.runAction.mockRejectedValue(new Error("power on failed"));

		const outcome = await settle(
			resizeCloudServerVm(mocks.record as Record_, "s-2vcpu-4gb-intel", 4),
		);

		expect(outcome).not.toHaveProperty("error");
	});
});
