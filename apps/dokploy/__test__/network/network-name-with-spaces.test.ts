import { execFileSync } from "node:child_process";
import Docker from "dockerode";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const networkName = `dokploy test ${Date.now()}`;

const row = {
	networkId: "network-id",
	name: networkName,
	organizationId: "org-id",
	serverId: null,
};

const rowQuery = {
	from: () => rowQuery,
	where: () => rowQuery,
	set: () => rowQuery,
	limit: async () => [row],
	returning: async () => [row],
};

vi.mock("@dokploy/server/db", () => ({
	db: {
		select: () => rowQuery,
		update: () => rowQuery,
		delete: () => rowQuery,
	},
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => new Docker(),
}));

const { inspectNetwork, removeNetwork, resyncNetwork } = await import(
	"@dokploy/server/services/network"
);

const hasDocker = () => {
	try {
		execFileSync("docker", ["info"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const networkExists = () =>
	execFileSync("docker", ["network", "ls", "--format", "{{.Name}}"], {
		encoding: "utf8",
	})
		.split("\n")
		.includes(networkName);

describe.skipIf(!hasDocker())("network named with spaces", () => {
	beforeAll(() => {
		execFileSync("docker", ["network", "create", networkName]);
	});

	afterAll(() => {
		if (networkExists()) {
			execFileSync("docker", ["network", "rm", networkName]);
		}
	});

	it("inspects the network", async () => {
		const info = await inspectNetwork(row.networkId);

		expect(info.Name).toBe(networkName);
	});

	it("resyncs the network", async () => {
		await expect(
			resyncNetwork(row.networkId, row.organizationId),
		).resolves.toBeDefined();
	});

	it("removes the network", async () => {
		await removeNetwork(row.networkId);

		expect(networkExists()).toBe(false);
	});
});
