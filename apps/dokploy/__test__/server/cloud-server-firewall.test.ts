import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VPC_RANGE = "10.120.16.0/20";
const ANYWHERE = ["0.0.0.0/0", "::/0"];

const mocks = vi.hoisted(() => ({
	record: {} as Record<string, unknown>,
	updates: [] as Record<string, unknown>[],
	calls: [] as string[],
	doFirewallRules: [] as unknown[],
	createFirewall: vi.fn(),
	updateFirewall: vi.fn(),
	createDroplet: vi.fn(),
	createVpc: vi.fn(),
	dropletCount: vi.fn(),
	getVpcRange: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => {
	const db = {
		update: () => ({
			set: (values: Record<string, unknown>) => ({
				where: () => {
					mocks.updates.push(values);
					Object.assign(mocks.record, values);
					return Object.assign(Promise.resolve(), {
						returning: async () => [mocks.record],
					});
				},
			}),
		}),
		query: {
			cloudServer: {
				findFirst: async () => mocks.record,
			},
		},
		execute: async () => undefined,
		transaction: (run: (tx: unknown) => unknown) => run(db),
	};
	return { db };
});

vi.mock("@dokploy/server/utils/digitalocean", () => ({
	getCloudServerTag: (id: string) => `dokploy-cs:${id}`,
	ensureDigitalOceanDefaultVpc: vi.fn(),
	createDigitalOceanVpc: mocks.createVpc,
	getDigitalOceanVpcRange: mocks.getVpcRange,
	createDigitalOceanSshKey: vi.fn(async () => 1),
	deleteDigitalOceanSshKey: vi.fn(async () => undefined),
	createDigitalOceanFirewall: mocks.createFirewall,
	updateDigitalOceanFirewall: mocks.updateFirewall,
	createDigitalOceanDroplet: mocks.createDroplet,
	getDigitalOceanDropletCount: mocks.dropletCount,
	getDigitalOceanFirewall: async () => ({
		id: "fw-1",
		name: "fw",
		status: "succeeded",
		inbound_rules: mocks.doFirewallRules,
	}),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: async () => ({ metricsConfig: { server: { port: 4500 } } }),
}));
vi.mock("@dokploy/server/services/ssh-key", () => ({}));
vi.mock("@dokploy/server/services/deployment", () => ({}));
vi.mock("@dokploy/server/setup/server-setup", () => ({}));
vi.mock("@dokploy/server/utils/filesystem/ssh", () => ({
	generateSSHKey: async () => ({ publicKey: "pub", privateKey: "priv" }),
}));

const {
	assertCloudServerCapacity,
	getCloudServerFirewall,
	provisionCloudServer,
	updateCloudServerFirewall,
} = await import("@dokploy/server/services/cloud-server");

type Record_ = Parameters<typeof getCloudServerFirewall>[0];

const readyRecord = (overrides: Record<string, unknown> = {}) =>
	({
		cloudServerId: "cs-1",
		organizationId: "org-1",
		status: "ready",
		hostname: "dokploy-org1-abc",
		providerVmId: "123",
		providerNetworkId: "vpc-1",
		providerFirewallId: "fw-1",
		serverId: "server-1",
		...overrides,
	}) as unknown as Record_;

const provision = (organizationId = "org-1") =>
	provisionCloudServer({
		cloudServerId: "cs-1",
		organizationId,
		doSize: "s-1vcpu-2gb-intel",
		swapGb: 2,
		zone: "sfo2",
		hostname: "dokploy-org1-abc",
	});

const sentRules = (mock: typeof mocks.createFirewall) =>
	mock.mock.calls.at(-1)?.at(-1).inboundRules as {
		protocol: string;
		ports?: string;
		sources: { addresses: string[] };
	}[];

describe("cloud server firewall", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.record = { providerNetworkId: "vpc-1" };
		mocks.updates = [];
		mocks.calls = [];
		mocks.doFirewallRules = [];
		mocks.getVpcRange.mockResolvedValue(VPC_RANGE);
		mocks.createVpc.mockResolvedValue("vpc-new");
		mocks.createFirewall.mockImplementation(async () => {
			mocks.calls.push("firewall");
			return "fw-new";
		});
		mocks.createDroplet.mockImplementation(async () => {
			mocks.calls.push("droplet");
			throw new Error("droplet limit reached");
		});
	});

	it("creates the firewall before the droplet and keeps its id when the droplet fails", async () => {
		await expect(provision()).rejects.toThrow("droplet limit reached");

		expect(mocks.calls).toEqual(["firewall", "droplet"]);
		expect(mocks.updates).toContainEqual(
			expect.objectContaining({ providerFirewallId: "fw-new" }),
		);
		expect(mocks.createFirewall.mock.calls[0]?.[0].tag).toBe("dokploy-cs:cs-1");
	});

	it("never creates the droplet when the firewall can't be created", async () => {
		mocks.createFirewall.mockRejectedValue(new Error("firewall quota"));

		await expect(provision()).rejects.toThrow("firewall quota");
		expect(mocks.createDroplet).not.toHaveBeenCalled();
	});

	it("names the VPC after the whole organization id, swapping the characters DO rejects", async () => {
		mocks.record = {};

		await provision("N7cQ83ecdyLqC-wO_kkdm").catch(() => undefined);

		expect(mocks.createVpc.mock.calls[0]?.[0].name).toMatch(
			/^dokploy-N7cQ83ecdyLqC-wO\.kkdm-sfo2-[a-z0-9]{4}$/,
		);
	});

	it("puts a second server of the organization in the VPC it already has", async () => {
		await provision().catch(() => undefined);

		expect(mocks.createVpc).not.toHaveBeenCalled();
		expect(mocks.createDroplet.mock.calls[0]?.[0].vpcId).toBe("vpc-1");
	});

	it("opens only ssh, monitoring, web and the organization's own VPC by default", async () => {
		await provision().catch(() => undefined);

		expect(sentRules(mocks.createFirewall)).toEqual([
			{ protocol: "tcp", ports: "22", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "4500", sources: { addresses: ANYWHERE } },
			{
				protocol: "tcp",
				ports: "1-65535",
				sources: { addresses: [VPC_RANGE] },
			},
			{
				protocol: "udp",
				ports: "1-65535",
				sources: { addresses: [VPC_RANGE] },
			},
			{ protocol: "tcp", ports: "80", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "443", sources: { addresses: ANYWHERE } },
			{ protocol: "icmp", sources: { addresses: ANYWHERE } },
		]);
	});

	it("lists the private network as a locked rule and hides it from the editable ones", async () => {
		mocks.doFirewallRules = [
			{ protocol: "tcp", ports: "22", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "4500", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "0", sources: { addresses: [VPC_RANGE] } },
			{ protocol: "udp", ports: "all", sources: { addresses: [VPC_RANGE] } },
			{ protocol: "tcp", ports: "80", sources: { addresses: ANYWHERE } },
		];

		const firewall = await getCloudServerFirewall(readyRecord());

		expect(firewall.enabled).toBe(true);
		expect(firewall.systemRules).toHaveLength(4);
		expect(firewall.rules).toEqual([
			{ protocol: "tcp", ports: "80", sources: ANYWHERE },
		]);
	});

	it("keeps a customer rule that shares ports with a locked rule but not its sources", async () => {
		mocks.doFirewallRules = [
			{ protocol: "tcp", ports: "all", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "22", sources: { addresses: ["1.2.3.4"] } },
		];

		const firewall = await getCloudServerFirewall(readyRecord());

		expect(firewall.rules).toEqual([
			{ protocol: "tcp", ports: "1-65535", sources: ANYWHERE },
			{ protocol: "tcp", ports: "22", sources: ["1.2.3.4"] },
		]);
	});

	it("always sends the locked rules, even when the customer sends none or duplicates them", async () => {
		mocks.record = readyRecord() as unknown as Record<string, unknown>;

		await updateCloudServerFirewall(readyRecord(), [
			{ protocol: "tcp", ports: "1-65535", sources: [VPC_RANGE] },
			{ protocol: "tcp", ports: "5432", sources: ["1.2.3.4"] },
		]);

		expect(sentRules(mocks.updateFirewall)).toEqual([
			{ protocol: "tcp", ports: "22", sources: { addresses: ANYWHERE } },
			{ protocol: "tcp", ports: "4500", sources: { addresses: ANYWHERE } },
			{
				protocol: "tcp",
				ports: "1-65535",
				sources: { addresses: [VPC_RANGE] },
			},
			{
				protocol: "udp",
				ports: "1-65535",
				sources: { addresses: [VPC_RANGE] },
			},
			{ protocol: "tcp", ports: "5432", sources: { addresses: ["1.2.3.4"] } },
		]);
	});

	it("recreates the firewall with the private network rule after it was disabled", async () => {
		const record = readyRecord({ providerFirewallId: null });
		mocks.record = record as unknown as Record<string, unknown>;

		await updateCloudServerFirewall(record, []);

		expect(mocks.updateFirewall).not.toHaveBeenCalled();
		expect(sentRules(mocks.createFirewall)).toContainEqual({
			protocol: "tcp",
			ports: "1-65535",
			sources: { addresses: [VPC_RANGE] },
		});
	});

	it("skips the private network rule for a server without a VPC", async () => {
		const firewall = await getCloudServerFirewall(
			readyRecord({ providerNetworkId: null }),
		);

		expect(mocks.getVpcRange).not.toHaveBeenCalled();
		expect(firewall.systemRules).toHaveLength(2);
	});

	it("refuses to touch the firewall of a server that isn't ready", async () => {
		await expect(
			getCloudServerFirewall(readyRecord({ status: "provisioning" })),
		).rejects.toThrow("Server is not ready");
	});

	describe("capacity", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("doesn't ask DigitalOcean when no droplet limit is configured", async () => {
			vi.stubEnv("DIGITALOCEAN_DROPLET_LIMIT", "");

			await assertCloudServerCapacity();
			expect(mocks.dropletCount).not.toHaveBeenCalled();
		});

		it("allows the purchase while the account is under its droplet limit", async () => {
			vi.stubEnv("DIGITALOCEAN_DROPLET_LIMIT", "10");
			mocks.dropletCount.mockResolvedValue(9);

			await expect(assertCloudServerCapacity()).resolves.toBeUndefined();
		});

		it("rejects the purchase once the account has reached its droplet limit", async () => {
			vi.stubEnv("DIGITALOCEAN_DROPLET_LIMIT", "10");
			mocks.dropletCount.mockResolvedValue(10);

			await expect(assertCloudServerCapacity()).rejects.toThrow("at capacity");
		});
	});
});
