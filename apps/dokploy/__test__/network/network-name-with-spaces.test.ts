import Docker from "dockerode";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const docker = new Docker();
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
	getRemoteDocker: async () => docker,
}));

const { inspectNetwork, removeNetwork, resyncNetwork } = await import(
	"@dokploy/server/services/network"
);

const hasDocker = await docker.ping().then(
	() => true,
	() => false,
);

const networkExists = async () =>
	(await docker.listNetworks()).some((info) => info.Name === networkName);

describe.skipIf(!hasDocker)("network named with spaces", () => {
	beforeAll(async () => {
		await docker.createNetwork({ Name: networkName });
	});

	afterAll(async () => {
		if (await networkExists()) {
			await docker.getNetwork(encodeURIComponent(networkName)).remove();
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

		expect(await networkExists()).toBe(false);
	});
});
