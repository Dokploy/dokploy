import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Docker utilities first
vi.mock("@dokploy/server/utils/docker/network-utils", () => ({
	createDockerNetwork: vi.fn().mockResolvedValue({ id: "docker-net-123" }),
	removeDockerNetwork: vi.fn().mockResolvedValue(undefined),
	dockerNetworkExists: vi.fn().mockResolvedValue(false),
	inspectDockerNetwork: vi
		.fn()
		.mockResolvedValue({ Id: "docker-net-123", Name: "test-network" }),
	listDockerNetworks: vi.fn().mockResolvedValue([]),
	ensureTraefikConnectedToNetwork: vi.fn().mockResolvedValue(undefined),
	ensureTraefikDisconnectedFromNetwork: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			networks: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			applications: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			compose: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			postgres: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			mysql: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			mariadb: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			mongo: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			redis: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			organization: {
				findFirst: vi.fn(),
			},
			projects: {
				findFirst: vi.fn(),
			},
		},
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([
					{
						networkId: "net-123",
						name: "Test Network",
						networkName: "test-network",
						driver: "bridge",
						organizationId: "org-1",
					},
				]),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn().mockResolvedValue([
						{
							networkId: "net-123",
							name: "Updated Network",
						},
					]),
				})),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn().mockResolvedValue([
					{
						networkId: "net-123",
						name: "Deleted Network",
					},
				]),
			})),
		})),
	},
}));

import { db } from "@dokploy/server/db";
import {
	assignNetworkToResource,
	connectTraefikToResourceNetworks,
	createNetwork,
	deleteNetwork,
	importOrphanedNetworks,
	removeNetworkFromResource,
	syncNetworks,
	updateNetwork,
} from "@dokploy/server/services/network";
import {
	dockerNetworkExists,
	ensureTraefikConnectedToNetwork,
	ensureTraefikDisconnectedFromNetwork,
	inspectDockerNetwork,
	listDockerNetworks,
	removeDockerNetwork,
} from "@dokploy/server/utils/docker/network-utils";

describe("createNetwork", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue(null);
		vi.mocked(dockerNetworkExists).mockResolvedValue(false);
	});

	it("creates network with Docker and DB", async () => {
		const input = {
			name: "My Network",
			networkName: "my-network",
			driver: "bridge" as const,
			organizationId: "org-1",
		};

		const result = await createNetwork(input);

		expect(result.networkId).toBe("net-123");
		expect(result.name).toBe("Test Network");
		expect(dockerNetworkExists).toHaveBeenCalledWith("my-network", undefined);
		expect(inspectDockerNetwork).toHaveBeenCalled();
	});

	it("throws on duplicate network name in organization", async () => {
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "existing-net",
			networkName: "existing-network",
			organizationId: "org-1",
		} as any);

		const input = {
			name: "Duplicate",
			networkName: "existing-network",
			organizationId: "org-1",
		};

		await expect(createNetwork(input)).rejects.toThrow("already exists");
	});

	it("throws when Docker network already exists", async () => {
		vi.mocked(dockerNetworkExists).mockResolvedValue(true);

		const input = {
			name: "Test",
			networkName: "existing-docker-net",
			organizationId: "org-1",
		};

		await expect(createNetwork(input)).rejects.toThrow(
			"Docker network 'existing-docker-net' already exists",
		);
	});

	it("creates network with IPAM configuration", async () => {
		const input = {
			name: "IPAM Network",
			networkName: "ipam-net",
			organizationId: "org-1",
			subnet: "172.20.0.0/16",
			gateway: "172.20.0.1",
			ipRange: "172.20.10.0/24",
		};

		await createNetwork(input);

		expect(inspectDockerNetwork).toHaveBeenCalled();
	});
});

describe("updateNetwork", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			name: "Original Network",
			organizationId: "org-1",
			project: null,
			server: null,
		} as any);
	});

	it("updates network metadata", async () => {
		const updates = {
			name: "Updated Name",
			description: "New description",
		};

		const result = await updateNetwork("net-123", updates);

		expect(result.name).toBe("Updated Network");
		expect(db.update).toHaveBeenCalled();
	});
});

describe("deleteNetwork", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			networkName: "test-network",
			serverId: null,
			project: null,
			server: null,
		} as any);

		// Mock isNetworkInUse checks - must return undefined for unused
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);
		vi.mocked(db.query.postgres.findMany).mockResolvedValue([]);
		vi.mocked(db.query.mysql.findMany).mockResolvedValue([]);
		vi.mocked(db.query.mariadb.findMany).mockResolvedValue([]);
		vi.mocked(db.query.mongo.findMany).mockResolvedValue([]);
		vi.mocked(db.query.redis.findMany).mockResolvedValue([]);

		// Mock inspectDockerNetwork for container check
		vi.mocked(inspectDockerNetwork).mockResolvedValue({
			Id: "docker-net-123",
			Name: "test-network",
			Containers: {},
		} as any);
	});

	it("deletes unused network", async () => {
		const result = await deleteNetwork("net-123");

		expect(result.name).toBe("Deleted Network");
		expect(removeDockerNetwork).toHaveBeenCalledWith("test-network", null);
		expect(db.delete).toHaveBeenCalled();
	});

	it("throws when network is in use by application", async () => {
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-1",
				customNetworkIds: ["net-123"],
			} as any,
		]);

		await expect(deleteNetwork("net-123")).rejects.toThrow(
			"Cannot delete network that is in use",
		);
	});

	it("continues deletion if Docker removal fails", async () => {
		vi.mocked(removeDockerNetwork).mockRejectedValue(new Error("Docker error"));

		await expect(deleteNetwork("net-123")).rejects.toThrow(
			"Failed to remove Docker network",
		);
	});
});

describe("assignNetworkToResource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			networkName: "test-network",
			driver: "bridge",
			project: null,
			server: null,
		} as any);
	});

	it("assigns bridge network to compose (docker-compose mode)", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			composeId: "compose-1",
			customNetworkIds: [],
			composeType: "docker-compose",
		} as any);

		const result = await assignNetworkToResource(
			"net-123",
			"compose-1",
			"compose",
		);

		expect(result.success).toBe(true);
		// Traefik connection is deferred until a domain is added
		expect(ensureTraefikConnectedToNetwork).not.toHaveBeenCalled();
	});

	it("throws when assigning bridge network to swarm service", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: [],
		} as any);

		await expect(
			assignNetworkToResource("net-123", "app-1", "application"),
		).rejects.toThrow("requires an overlay network");
	});

	it("allows overlay network for swarm services", async () => {
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			networkName: "overlay-net",
			driver: "overlay",
			project: null,
			server: null,
		} as any);

		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: [],
		} as any);

		const result = await assignNetworkToResource(
			"net-123",
			"app-1",
			"application",
		);

		expect(result.success).toBe(true);
	});

	it("throws when network already assigned", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: ["net-123"],
		} as any);

		await expect(
			assignNetworkToResource("net-123", "app-1", "application"),
		).rejects.toThrow("already assigned");
	});

	it("does not connect Traefik on network assignment (deferred until domain is added)", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: [],
			serverId: "server-1",
		} as any);

		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			networkName: "overlay-net",
			driver: "overlay",
			serverId: "server-1",
			project: null,
			server: { name: "Test Server", serverId: "server-1" },
		} as any);

		await assignNetworkToResource("net-123", "app-1", "application");

		// Traefik connection is deferred until a domain is added to the resource
		expect(ensureTraefikConnectedToNetwork).not.toHaveBeenCalled();
	});
});

describe("removeNetworkFromResource", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-123",
			networkName: "test-network",
			serverId: "server-1",
			project: null,
			server: null,
		} as any);

		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);
	});

	it("removes network from resource", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: ["net-123", "net-456"],
		} as any);

		const result = await removeNetworkFromResource(
			"net-123",
			"app-1",
			"application",
		);

		expect(result.success).toBe(true);
		expect(db.update).toHaveBeenCalled();
	});

	it("disconnects Traefik when no resources with domains use network", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: ["net-123"],
		} as any);

		await removeNetworkFromResource("net-123", "app-1", "application");

		expect(ensureTraefikDisconnectedFromNetwork).toHaveBeenCalledWith(
			"test-network",
			"server-1",
		);
	});

	it("keeps Traefik connected when other resources with domains use network", async () => {
		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: ["net-123"],
		} as any);

		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-2",
				customNetworkIds: ["net-123"],
				domains: [{ domainId: "domain-1" }],
			} as any,
		]);

		await removeNetworkFromResource("net-123", "app-1", "application");

		expect(ensureTraefikDisconnectedFromNetwork).not.toHaveBeenCalled();
	});
});

describe("syncNetworks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("detects missing networks (in DB, not in Docker)", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([]);
		vi.mocked(db.query.networks.findMany).mockResolvedValue([
			{
				networkId: "net-1",
				networkName: "missing-network",
			} as any,
		]);

		const result = await syncNetworks();

		expect(result.missing).toEqual(["missing-network"]);
		expect(result.orphaned).toEqual([]);
	});

	it("detects orphaned networks (in Docker, not in DB)", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "orphan-network",
				Id: "docker-123",
				Labels: { "com.dokploy.organization.id": "org-1" },
			} as any,
		]);
		vi.mocked(db.query.networks.findMany).mockResolvedValue([]);

		const result = await syncNetworks();

		expect(result.missing).toEqual([]);
		expect(result.orphaned).toEqual(["orphan-network"]);
	});

	it("ignores Docker networks without Dokploy labels", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "bridge",
				Id: "bridge-id",
				Labels: {},
			} as any,
		]);
		vi.mocked(db.query.networks.findMany).mockResolvedValue([]);

		const result = await syncNetworks();

		expect(result.orphaned).toEqual([]);
	});

	it("detects both missing and orphaned networks", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "orphan-1",
				Id: "docker-1",
				Labels: { "com.dokploy.organization.id": "org-1" },
			} as any,
		]);
		vi.mocked(db.query.networks.findMany).mockResolvedValue([
			{
				networkId: "net-1",
				networkName: "missing-1",
			} as any,
		]);

		const result = await syncNetworks();

		expect(result.missing).toEqual(["missing-1"]);
		expect(result.orphaned).toEqual(["orphan-1"]);
	});
});

describe("importOrphanedNetworks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.query.networks.findFirst).mockResolvedValue(null);
	});

	it("imports Docker networks with Dokploy labels", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "custom-network",
				Id: "docker-456",
				Driver: "bridge",
				Labels: {
					"com.dokploy.organization.id": "org-1",
					"com.dokploy.network.name": "Custom Network",
				},
			} as any,
		]);

		vi.mocked(inspectDockerNetwork).mockResolvedValue({
			Id: "docker-456",
			Attachable: true,
			Internal: false,
			IPAM: {
				Config: [
					{
						Subnet: "172.20.0.0/16",
						Gateway: "172.20.0.1",
					},
				],
			},
		} as any);

		// Mock organization exists
		vi.mocked(db.query.organization.findFirst).mockResolvedValue({
			id: "org-1",
			name: "Test Org",
		} as any);

		const result = await importOrphanedNetworks();

		expect(result.imported).toHaveLength(1);
		expect(result.errors).toHaveLength(0);
	});

	it("skips networks without Dokploy organization label", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "bridge",
				Id: "bridge-id",
				Labels: {},
			} as any,
		]);

		const result = await importOrphanedNetworks();

		expect(result.imported).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});

	it("skips networks already in DB", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "existing-network",
				Id: "docker-789",
				Labels: { "com.dokploy.organization.id": "org-1" },
			} as any,
		]);

		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-1",
			networkName: "existing-network",
		} as any);

		const result = await importOrphanedNetworks();

		expect(result.imported).toHaveLength(0);
	});

	it("handles import errors gracefully", async () => {
		vi.mocked(listDockerNetworks).mockResolvedValue([
			{
				Name: "error-network",
				Id: "docker-error",
				Labels: { "com.dokploy.organization.id": "org-1" },
			} as any,
		]);

		vi.mocked(inspectDockerNetwork).mockRejectedValue(
			new Error("Inspect failed"),
		);

		const result = await importOrphanedNetworks();

		expect(result.imported).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.networkName).toBe("error-network");
	});
});

describe("connectTraefikToResourceNetworks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("connects Traefik to specific domain network when domainNetworkId is provided", async () => {
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-1",
			networkName: "custom-network",
			internal: false,
		} as any);

		await connectTraefikToResourceNetworks(
			"app-1",
			"application",
			undefined,
			"net-1",
		);

		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledTimes(1);
		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledWith(
			"custom-network",
			undefined,
		);
	});

	it("connects to dokploy-network when no domainNetworkId is provided", async () => {
		await connectTraefikToResourceNetworks(
			"app-1",
			"application",
			undefined,
			null,
		);

		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledTimes(1);
		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledWith(
			"dokploy-network",
			undefined,
		);
	});

	it("falls back to dokploy-network when domain network is internal", async () => {
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-1",
			networkName: "internal-network",
			internal: true,
		} as any);

		await connectTraefikToResourceNetworks(
			"app-1",
			"application",
			undefined,
			"net-1",
		);

		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledTimes(1);
		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledWith(
			"dokploy-network",
			undefined,
		);
	});

	it("continues on Traefik connection errors and falls back to dokploy-network", async () => {
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-1",
			networkName: "custom-network",
			internal: false,
		} as any);

		vi.mocked(ensureTraefikConnectedToNetwork).mockRejectedValueOnce(
			new Error("Connection failed"),
		);

		await expect(
			connectTraefikToResourceNetworks(
				"app-1",
				"application",
				undefined,
				"net-1",
			),
		).resolves.not.toThrow();

		// Should be called twice: once for custom-network (fails), once for fallback
		expect(ensureTraefikConnectedToNetwork).toHaveBeenCalledTimes(2);
		expect(ensureTraefikConnectedToNetwork).toHaveBeenNthCalledWith(
			1,
			"custom-network",
			undefined,
		);
		expect(ensureTraefikConnectedToNetwork).toHaveBeenNthCalledWith(
			2,
			"dokploy-network",
			undefined,
		);
	});
});
