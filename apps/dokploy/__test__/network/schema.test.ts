import {
	apiAssignNetworkToResource,
	apiCreateNetwork,
	apiRemoveNetworkFromResource,
	apiUpdateNetwork,
} from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("Network Schema Validation", () => {
	describe("apiCreateNetwork", () => {
		it("validates correct network creation with all fields", () => {
			const validNetwork = {
				name: "My Production Network",
				description: "Network for production services",
				networkName: "prod-network",
				driver: "bridge" as const,
				subnet: "172.20.0.0/16",
				gateway: "172.20.0.1",
				ipRange: "172.20.10.0/24",
				attachable: true,
				internal: false,
				organizationId: "org-123",
				projectId: "proj-456",
				serverId: "server-789",
			};

			expect(() => apiCreateNetwork.parse(validNetwork)).not.toThrow();
		});

		it("validates minimal required fields", () => {
			const minimalNetwork = {
				name: "Test Network",
				networkName: "test-net",
				organizationId: "org-123",
			};

			expect(() => apiCreateNetwork.parse(minimalNetwork)).not.toThrow();
		});

		it("validates overlay driver", () => {
			const overlayNetwork = {
				name: "Swarm Network",
				networkName: "swarm-net",
				driver: "overlay" as const,
				organizationId: "org-123",
			};

			expect(() => apiCreateNetwork.parse(overlayNetwork)).not.toThrow();
		});

		describe("networkName validation", () => {
			it("accepts valid network names", () => {
				const validNames = [
					"simple",
					"with-hyphens",
					"with_underscores",
					"with.dots",
					"AlphaNumerics123",
					"a1b2c3",
				];

				for (const name of validNames) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: name,
							organizationId: "org-1",
						}),
					).not.toThrow();
				}
			});

			it("rejects network names starting with non-alphanumeric", () => {
				const invalidNames = ["-starts-with-hyphen", "_starts-with-underscore"];

				for (const name of invalidNames) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: name,
							organizationId: "org-1",
						}),
					).toThrow();
				}
			});

			it("rejects empty network name", () => {
				expect(() =>
					apiCreateNetwork.parse({
						name: "Test",
						networkName: "",
						organizationId: "org-1",
					}),
				).toThrow();
			});

			it("rejects network name exceeding 63 characters", () => {
				const longName = "a".repeat(64);
				expect(() =>
					apiCreateNetwork.parse({
						name: "Test",
						networkName: longName,
						organizationId: "org-1",
					}),
				).toThrow();
			});
		});

		describe("subnet validation (CIDR)", () => {
			it("accepts valid CIDR formats", () => {
				const validSubnets = [
					"172.20.0.0/16",
					"10.0.0.0/8",
					"192.168.1.0/24",
					"172.31.0.0/20",
					"10.10.10.0/32",
				];

				for (const subnet of validSubnets) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							subnet,
							organizationId: "org-1",
						}),
					).not.toThrow();
				}
			});

			it("rejects invalid CIDR formats", () => {
				const invalidSubnets = [
					"172.20.0.0", // Missing CIDR notation
					"172.20.0.0/33", // Invalid CIDR range (max 32)
					"256.0.0.0/16", // Invalid IP (256)
					"172.20/16", // Incomplete IP
					"not-an-ip/16",
				];

				for (const subnet of invalidSubnets) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							subnet,
							organizationId: "org-1",
						}),
					).toThrow();
				}
			});
		});

		describe("gateway validation (IPv4)", () => {
			it("accepts valid IPv4 addresses", () => {
				const validGateways = [
					"172.20.0.1",
					"10.0.0.1",
					"192.168.1.1",
					"255.255.255.255",
					"0.0.0.0",
				];

				for (const gateway of validGateways) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							gateway,
							organizationId: "org-1",
						}),
					).not.toThrow();
				}
			});

			it("rejects invalid IPv4 addresses", () => {
				const invalidGateways = [
					"256.0.0.1", // Octet > 255
					"172.20.0", // Incomplete
					"172.20.0.1.5", // Extra octet
					"not-an-ip",
					"172.20.0.1/24", // CIDR notation (not allowed for gateway)
				];

				for (const gateway of invalidGateways) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							gateway,
							organizationId: "org-1",
						}),
					).toThrow();
				}
			});
		});

		describe("ipRange validation (CIDR)", () => {
			it("accepts valid IP range CIDR", () => {
				const validRanges = ["172.20.10.0/24", "10.0.1.0/28", "192.168.1.0/26"];

				for (const ipRange of validRanges) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							ipRange,
							organizationId: "org-1",
						}),
					).not.toThrow();
				}
			});

			it("rejects invalid IP range formats", () => {
				const invalidRanges = ["172.20.10.0", "not-a-range", "256.0.0.0/24"];

				for (const ipRange of invalidRanges) {
					expect(() =>
						apiCreateNetwork.parse({
							name: "Test",
							networkName: "test-net",
							ipRange,
							organizationId: "org-1",
						}),
					).toThrow();
				}
			});
		});
	});

	describe("apiUpdateNetwork", () => {
		it("validates partial network update", () => {
			const partialUpdate = {
				networkId: "net-123",
				name: "Updated Name",
				description: "Updated description",
			};

			expect(() => apiUpdateNetwork.parse(partialUpdate)).not.toThrow();
		});

		it("requires networkId", () => {
			const missingId = {
				name: "Updated Name",
			};

			expect(() => apiUpdateNetwork.parse(missingId)).toThrow();
		});
	});

	describe("apiAssignNetworkToResource", () => {
		it("validates correct assignment", () => {
			const validAssignment = {
				networkId: "net-123",
				resourceId: "app-456",
				resourceType: "application" as const,
			};

			expect(() =>
				apiAssignNetworkToResource.parse(validAssignment),
			).not.toThrow();
		});

		it("validates all resource types", () => {
			const resourceTypes = [
				"application",
				"compose",
				"postgres",
				"mysql",
				"mariadb",
				"mongo",
				"redis",
			] as const;

			for (const resourceType of resourceTypes) {
				expect(() =>
					apiAssignNetworkToResource.parse({
						networkId: "net-1",
						resourceId: "res-1",
						resourceType,
					}),
				).not.toThrow();
			}
		});

		it("rejects invalid resource type", () => {
			expect(() =>
				apiAssignNetworkToResource.parse({
					networkId: "net-1",
					resourceId: "res-1",
					resourceType: "invalid-type",
				}),
			).toThrow();
		});

		it("requires all fields", () => {
			expect(() =>
				apiAssignNetworkToResource.parse({
					networkId: "net-1",
					resourceId: "res-1",
				}),
			).toThrow();
		});
	});

	describe("apiRemoveNetworkFromResource", () => {
		it("validates correct removal", () => {
			const validRemoval = {
				networkId: "net-123",
				resourceId: "app-456",
				resourceType: "application" as const,
			};

			expect(() =>
				apiRemoveNetworkFromResource.parse(validRemoval),
			).not.toThrow();
		});

		it("requires all fields", () => {
			expect(() =>
				apiRemoveNetworkFromResource.parse({
					networkId: "net-1",
				}),
			).toThrow();
		});
	});
});
