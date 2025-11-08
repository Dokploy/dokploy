import type { ComposeSpecification } from "@dokploy/server";
import {
	addAppNameToRootNetwork,
	addAppNameToServiceNetworks,
	addCustomNetworksToCompose,
} from "@dokploy/server/utils/docker/collision/root-network";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

// Mock the database
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			networks: {
				findMany: vi.fn(),
			},
		},
	},
}));

import { db } from "@dokploy/server/db";

describe("addAppNameToRootNetwork", () => {
	it("adds external network to compose", () => {
		const compose: ComposeSpecification = {
			services: {
				web: {
					image: "nginx",
				},
			},
		};

		const result = addAppNameToRootNetwork(compose, "dokploy-network");

		expect(result.networks).toBeDefined();
		expect(result.networks?.["dokploy-network"]).toEqual({
			name: "dokploy-network",
			external: true,
		});
	});

	it("preserves existing networks", () => {
		const compose = parse(`
services:
  web:
    image: nginx
networks:
  frontend:
    driver: bridge
`) as ComposeSpecification;

		const result = addAppNameToRootNetwork(compose, "dokploy-network");

		expect(result.networks?.frontend).toBeDefined();
		expect(result.networks?.["dokploy-network"]).toEqual({
			name: "dokploy-network",
			external: true,
		});
	});

	it("initializes networks object if undefined", () => {
		const compose: ComposeSpecification = {
			services: {
				web: { image: "nginx" },
			},
		};

		const result = addAppNameToRootNetwork(compose, "test-network");

		expect(result.networks).toBeDefined();
		expect(result.networks?.["test-network"]).toBeDefined();
	});
});

describe("addAppNameToServiceNetworks", () => {
	it("adds network to services with array format", () => {
		const services = {
			web: {
				image: "nginx",
				networks: ["frontend", "backend"],
			},
			api: {
				image: "node",
				networks: ["backend"],
			},
		};

		const result = addAppNameToServiceNetworks(services, "dokploy-network");

		expect(result.web.networks).toContain("dokploy-network");
		expect(result.web.networks).toContain("frontend");
		expect(result.web.networks).toContain("backend");
		expect(result.api.networks).toContain("dokploy-network");
		expect(result.api.networks).toContain("backend");
	});

	it("adds network to services with object format", () => {
		const services = {
			web: {
				image: "nginx",
				networks: {
					frontend: {
						aliases: ["web-alias"],
					},
				},
			},
		};

		const result = addAppNameToServiceNetworks(services, "dokploy-network");

		expect(result.web.networks).toHaveProperty("dokploy-network");
		expect(result.web.networks).toHaveProperty("frontend");
	});

	it("handles services without networks", () => {
		const services = {
			web: {
				image: "nginx",
			},
			api: {
				image: "node",
			},
		};

		const result = addAppNameToServiceNetworks(services, "dokploy-network");

		expect(result.web.networks).toEqual(["dokploy-network"]);
		expect(result.api.networks).toEqual(["dokploy-network"]);
	});

	it("does not duplicate network if already present (array format)", () => {
		const services = {
			web: {
				image: "nginx",
				networks: ["dokploy-network", "frontend"],
			},
		};

		const result = addAppNameToServiceNetworks(services, "dokploy-network");

		const webNetworks = result.web.networks as string[];
		const count = webNetworks.filter((n) => n === "dokploy-network").length;
		expect(count).toBe(1);
	});

	it("handles mixed network formats across services", () => {
		const services = {
			web: {
				image: "nginx",
				networks: ["frontend"],
			},
			api: {
				image: "node",
				networks: {
					backend: {},
				},
			},
			worker: {
				image: "worker",
			},
		};

		const result = addAppNameToServiceNetworks(services, "dokploy-network");

		expect(Array.isArray(result.web.networks)).toBe(true);
		expect((result.web.networks as string[]).includes("dokploy-network")).toBe(
			true,
		);

		expect(typeof result.api.networks).toBe("object");
		expect(result.api.networks).toHaveProperty("dokploy-network");

		expect(result.worker.networks).toEqual(["dokploy-network"]);
	});
});

describe("addCustomNetworksToCompose (with mocked DB)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("adds custom networks from DB to compose", async () => {
		const mockNetworks = [
			{ networkId: "net-1", networkName: "custom-net-1" },
			{ networkId: "net-2", networkName: "custom-net-2" },
		];

		vi.mocked(db.query.networks.findMany).mockResolvedValue(mockNetworks);

		const compose: ComposeSpecification = {
			services: {
				web: { image: "nginx" },
			},
		};

		const result = await addCustomNetworksToCompose(compose, [
			"net-1",
			"net-2",
		]);

		expect(result.networks).toBeDefined();
		expect(result.networks?.["custom-net-1"]).toEqual({
			name: "custom-net-1",
			external: true,
		});
		expect(result.networks?.["custom-net-2"]).toEqual({
			name: "custom-net-2",
			external: true,
		});
	});

	it("adds custom networks to all services", async () => {
		const mockNetworks = [{ networkId: "net-1", networkName: "prod-network" }];

		vi.mocked(db.query.networks.findMany).mockResolvedValue(mockNetworks);

		const compose: ComposeSpecification = {
			services: {
				web: { image: "nginx", networks: ["frontend"] },
				api: { image: "node" },
			},
		};

		const result = await addCustomNetworksToCompose(compose, ["net-1"]);

		expect(
			(result.services?.web?.networks as string[]).includes("prod-network"),
		).toBe(true);
		expect(
			(result.services?.api?.networks as string[]).includes("prod-network"),
		).toBe(true);
	});

	it("handles empty custom networks array", async () => {
		vi.mocked(db.query.networks.findMany).mockResolvedValue([]);

		const compose: ComposeSpecification = {
			services: {
				web: { image: "nginx" },
			},
		};

		const result = await addCustomNetworksToCompose(compose, []);

		expect(result.networks).toBeDefined();
		expect(Object.keys(result.networks || {}).length).toBe(0);
	});

	it("preserves existing compose networks", async () => {
		const mockNetworks = [{ networkId: "net-1", networkName: "custom-net" }];

		vi.mocked(db.query.networks.findMany).mockResolvedValue(mockNetworks);

		const compose = parse(`
services:
  web:
    image: nginx
networks:
  frontend:
    driver: bridge
`) as ComposeSpecification;

		const result = await addCustomNetworksToCompose(compose, ["net-1"]);

		expect(result.networks?.frontend).toBeDefined();
		expect(result.networks?.["custom-net"]).toBeDefined();
	});

	it("initializes networks if undefined", async () => {
		const mockNetworks = [{ networkId: "net-1", networkName: "test-net" }];

		vi.mocked(db.query.networks.findMany).mockResolvedValue(mockNetworks);

		const compose: ComposeSpecification = {
			services: {
				web: { image: "nginx" },
			},
		};

		const result = await addCustomNetworksToCompose(compose, ["net-1"]);

		expect(result.networks).toBeDefined();
		expect(result.networks?.["test-net"]).toBeDefined();
	});

	it("handles services with object network format", async () => {
		const mockNetworks = [{ networkId: "net-1", networkName: "custom-net" }];

		vi.mocked(db.query.networks.findMany).mockResolvedValue(mockNetworks);

		const compose: ComposeSpecification = {
			services: {
				web: {
					image: "nginx",
					networks: {
						frontend: {
							aliases: ["web"],
						},
					},
				},
			},
		};

		const result = await addCustomNetworksToCompose(compose, ["net-1"]);

		expect(result.services?.web?.networks).toHaveProperty("custom-net");
		expect(result.services?.web?.networks).toHaveProperty("frontend");
	});
});
