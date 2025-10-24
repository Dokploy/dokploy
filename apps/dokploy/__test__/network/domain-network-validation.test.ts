import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock database
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			networks: {
				findFirst: vi.fn(),
			},
			applications: {
				findFirst: vi.fn(),
			},
			compose: {
				findFirst: vi.fn(),
			},
			domains: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
		},
	},
}));

const { db } = await import("@dokploy/server/db");

const { createDomain } = await import("@dokploy/server/services/domain");
const { findNetworkById } = await import("@dokploy/server/services/network");

vi.mock("@dokploy/server/services/network", () => ({
	findNetworkById: vi.fn(),
	connectTraefikToResourceNetworks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn().mockResolvedValue(undefined),
}));

describe("Domain Network Validation", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default mocks for successful scenarios
		vi.mocked(db.query.networks.findFirst).mockResolvedValue({
			networkId: "net-1",
			name: "Production Network",
			networkName: "prod-network",
			internal: false,
			serverId: "server-1",
			server: { name: "Test Server", serverId: "server-1" },
		} as any);

		vi.mocked(db.query.applications.findFirst).mockResolvedValue({
			applicationId: "app-1",
			customNetworkIds: ["net-1", "net-2"],
			serverId: "server-1",
			server: { name: "Test Server", serverId: "server-1" },
		} as any);

		vi.mocked(findNetworkById).mockImplementation(async (id: string) => {
			if (id === "net-1") {
				return {
					networkId: "net-1",
					name: "Production Network",
					networkName: "prod-network",
					internal: false,
					serverId: "server-1",
					server: { name: "Test Server", serverId: "server-1" },
				} as any;
			}
			if (id === "net-2") {
				return {
					networkId: "net-2",
					name: "Staging Network",
					networkName: "staging-network",
					internal: false,
					serverId: "server-1",
					server: { name: "Test Server", serverId: "server-1" },
				} as any;
			}
			throw new TRPCError({ code: "NOT_FOUND", message: "Network not found" });
		});
	});

	describe("createDomain - Multiple networks validation", () => {
		it("prevents creating domain with different network than existing domains (application)", async () => {
			// Mock existing domain with net-1
			vi.mocked(db.query.domains.findMany).mockResolvedValue([
				{
					domainId: "domain-1",
					applicationId: "app-1",
					networkId: "net-1",
					host: "prod.example.com",
				},
			] as any);

			// Mock DB transaction
			const mockTx = {
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								domainId: "domain-2",
								applicationId: "app-1",
								networkId: "net-2",
								host: "staging.example.com",
							},
						]),
					}),
				}),
			};
			vi.mocked(db as any).transaction = vi
				.fn()
				.mockImplementation((callback) => callback(mockTx));

			// Try to create domain with net-2
			await expect(
				createDomain({
					applicationId: "app-1",
					networkId: "net-2",
					host: "staging.example.com",
					https: true,
					port: null,
					path: null,
					serviceName: null,
					domainType: "application",
				} as any),
			).rejects.toThrow(
				'This application already has domain "prod.example.com" using network "Production Network". All domains must use the same network due to Docker/Traefik limitations. Please use "Production Network" for all domains.',
			);
		});

		it("prevents creating domain with different network than existing domains (compose)", async () => {
			// Mock compose instead of application
			vi.mocked(db.query.applications.findFirst).mockResolvedValue(
				undefined as any,
			);
			vi.mocked(db.query.compose.findFirst).mockResolvedValue({
				composeId: "compose-1",
				customNetworkIds: ["net-1", "net-2"],
				serverId: "server-1",
				server: { name: "Test Server", serverId: "server-1" },
			} as any);

			// Mock existing domain with net-1
			vi.mocked(db.query.domains.findMany).mockResolvedValue([
				{
					domainId: "domain-1",
					composeId: "compose-1",
					networkId: "net-1",
					host: "prod.example.com",
				},
			] as any);

			// Mock DB transaction
			const mockTx = {
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								domainId: "domain-2",
								composeId: "compose-1",
								networkId: "net-2",
								host: "staging.example.com",
							},
						]),
					}),
				}),
			};
			vi.mocked(db as any).transaction = vi
				.fn()
				.mockImplementation((callback) => callback(mockTx));

			// Try to create domain with net-2
			await expect(
				createDomain({
					composeId: "compose-1",
					networkId: "net-2",
					host: "staging.example.com",
					https: true,
					port: null,
					path: null,
					serviceName: null,
					domainType: "compose",
				} as any),
			).rejects.toThrow(
				'This compose already has domain "prod.example.com" using network "Production Network". All domains must use the same network due to Docker/Traefik limitations. Please use "Production Network" for all domains.',
			);
		});

		it("allows creating domain with same network as existing domains", async () => {
			// Mock existing domain with net-1
			vi.mocked(db.query.domains.findMany).mockResolvedValue([
				{
					domainId: "domain-1",
					applicationId: "app-1",
					networkId: "net-1",
					host: "prod.example.com",
				},
			] as any);

			// Mock findApplicationById
			const { findApplicationById } = await import(
				"@dokploy/server/services/application"
			);
			vi.mocked(findApplicationById).mockResolvedValue({
				applicationId: "app-1",
				serverId: "server-1",
			} as any);

			// Mock DB transaction to succeed
			const mockTx = {
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								domainId: "domain-2",
								applicationId: "app-1",
								networkId: "net-1",
								host: "prod2.example.com",
							},
						]),
					}),
				}),
			};
			vi.mocked(db as any).transaction = vi
				.fn()
				.mockImplementation((callback) => callback(mockTx));

			// This should succeed - same network
			const result = await createDomain({
				applicationId: "app-1",
				networkId: "net-1",
				host: "prod2.example.com",
				https: true,
				port: null,
				path: null,
				serviceName: null,
				domainType: "application",
			} as any);

			expect(result).toBeDefined();
			expect(result.networkId).toBe("net-1");
		});

		it("allows creating domain with no network when other domains have no network", async () => {
			// Mock existing domain with no network
			vi.mocked(db.query.domains.findMany).mockResolvedValue([
				{
					domainId: "domain-1",
					applicationId: "app-1",
					networkId: null,
					host: "default.example.com",
				},
			] as any);

			// Mock findApplicationById
			const { findApplicationById } = await import(
				"@dokploy/server/services/application"
			);
			vi.mocked(findApplicationById).mockResolvedValue({
				applicationId: "app-1",
				serverId: "server-1",
			} as any);

			// Mock DB transaction to succeed
			const mockTx = {
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								domainId: "domain-2",
								applicationId: "app-1",
								networkId: null,
								host: "default2.example.com",
							},
						]),
					}),
				}),
			};
			vi.mocked(db as any).transaction = vi
				.fn()
				.mockImplementation((callback) => callback(mockTx));

			// This should succeed - both use default network
			const result = await createDomain({
				applicationId: "app-1",
				networkId: null,
				host: "default2.example.com",
				https: true,
				port: null,
				path: null,
				serviceName: null,
				domainType: "application",
			} as any);

			expect(result).toBeDefined();
			expect(result.networkId).toBeNull();
		});
	});

	describe("updateDomain - Single domain network change", () => {
		it("allows changing network of the only domain without conflict error", async () => {
			const { updateDomain } = await import("@dokploy/server/services/domain");

			// Mock existing single domain with net-1
			vi.mocked(db.query.domains.findFirst).mockResolvedValue({
				domainId: "domain-1",
				applicationId: "app-1",
				networkId: "net-1",
				host: "local-nginx-47i56k-c87c1a.traefik.me",
			} as any);

			// Mock findDomainsByApplicationId to return the single domain
			vi.mocked(db.query.domains.findMany).mockResolvedValue([
				{
					domainId: "domain-1",
					applicationId: "app-1",
					networkId: "net-1",
					host: "local-nginx-47i56k-c87c1a.traefik.me",
				},
			] as any);

			// Mock findApplicationById
			const { findApplicationById } = await import(
				"@dokploy/server/services/application"
			);
			vi.mocked(findApplicationById).mockResolvedValue({
				applicationId: "app-1",
				serverId: "server-1",
			} as any);

			// Mock network query to include net-2
			vi.mocked(findNetworkById).mockImplementation(async (id: string) => {
				if (id === "net-1") {
					return {
						networkId: "net-1",
						name: "Preprod",
						networkName: "preprod-network",
						internal: false,
						serverId: "server-1",
						server: { name: "Test Server", serverId: "server-1" },
					} as any;
				}
				if (id === "net-2") {
					return {
						networkId: "net-2",
						name: "Dev",
						networkName: "dev-network",
						internal: false,
						serverId: "server-1",
						server: { name: "Test Server", serverId: "server-1" },
					} as any;
				}
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Network not found",
				});
			});

			// Update application mock to include net-2 in customNetworkIds
			vi.mocked(db.query.applications.findFirst).mockResolvedValue({
				applicationId: "app-1",
				customNetworkIds: ["net-1", "net-2"],
				serverId: "server-1",
				server: { name: "Test Server", serverId: "server-1" },
			} as any);

			// Mock DB update to succeed
			vi.mocked(db as any).update = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								domainId: "domain-1",
								applicationId: "app-1",
								networkId: "net-2",
								host: "local-nginx-47i56k-c87c1a.traefik.me",
							},
						]),
					}),
				}),
			});

			// This should succeed - changing the network of the only domain
			const result = await updateDomain("domain-1", {
				networkId: "net-2",
			});

			expect(result).toBeDefined();
			expect(result.networkId).toBe("net-2");
		});
	});
});
