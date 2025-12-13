/**
 * Unit tests for OrchestratorFactory
 *
 * These tests validate the factory pattern implementation
 * for creating orchestrator adapters with auto-detection.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { ServerConfig } from "@dokploy/server/services/orchestrator";

// Mock the database
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: {
				findFirst: vi.fn(),
			},
			server: {
				findFirst: vi.fn(),
			},
		},
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn().mockResolvedValue({}),
			})),
		})),
	},
}));

// Mock drizzle-orm eq function
vi.mock("drizzle-orm", () => ({
	eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

// Mock the schema
vi.mock("@dokploy/server/db/schema", () => ({
	server: { serverId: "serverId" },
	applications: { applicationId: "applicationId" },
}));

// Mock the adapters
vi.mock("@dokploy/server/services/orchestrator/swarm.adapter", () => ({
	SwarmAdapter: vi.fn().mockImplementation((config) => ({
		type: "swarm",
		config,
		detect: vi.fn().mockResolvedValue("swarm"),
		healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "OK" }),
	})),
}));

vi.mock("@dokploy/server/services/orchestrator/kubernetes.adapter", () => ({
	KubernetesAdapter: vi.fn().mockImplementation((config) => ({
		type: "kubernetes",
		config,
		detect: vi.fn().mockResolvedValue("kubernetes"),
		healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "OK" }),
		getHPAStatus: vi.fn().mockRejectedValue(new Error("404 Not Found")),
		getMetrics: vi.fn().mockResolvedValue(null),
		getNetworkPolicy: vi.fn().mockRejectedValue(new Error("404 Not Found")),
		getCustomResource: vi.fn().mockRejectedValue(new Error("404 Not Found")),
	})),
}));

// Import after mocking
import { OrchestratorFactory } from "@dokploy/server/services/orchestrator/factory";
import { SwarmAdapter } from "@dokploy/server/services/orchestrator/swarm.adapter";
import { KubernetesAdapter } from "@dokploy/server/services/orchestrator/kubernetes.adapter";
import { db } from "@dokploy/server/db";

describe("OrchestratorFactory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		OrchestratorFactory.clearCache();
	});

	describe("create()", () => {
		const swarmServerConfig: ServerConfig = {
			serverId: "server-1",
			name: "swarm-server",
			orchestratorType: "swarm",
			ipAddress: "192.168.1.100",
			port: 22,
			username: "root",
		};

		const k8sServerConfig: ServerConfig = {
			serverId: "server-2",
			name: "k8s-server",
			orchestratorType: "kubernetes",
			ipAddress: "192.168.1.101",
			port: 22,
			username: "root",
			k8sNamespace: "dokploy",
			k8sKubeconfig: "base64encodedconfig",
		};

		test("creates SwarmAdapter when orchestratorType is swarm", async () => {
			const adapter = await OrchestratorFactory.create(swarmServerConfig);

			expect(SwarmAdapter).toHaveBeenCalledWith(swarmServerConfig);
			expect((adapter as any).type).toBe("swarm");
		});

		test("creates KubernetesAdapter when orchestratorType is kubernetes", async () => {
			const adapter = await OrchestratorFactory.create(k8sServerConfig);

			expect(KubernetesAdapter).toHaveBeenCalledWith({
				inCluster: false,
				kubeconfig: "base64encodedconfig",
				context: undefined,
				namespace: "dokploy",
			});
			expect((adapter as any).type).toBe("kubernetes");
		});

		test("caches adapter instances", async () => {
			const adapter1 = await OrchestratorFactory.create(swarmServerConfig);
			const adapter2 = await OrchestratorFactory.create(swarmServerConfig);

			expect(adapter1).toBe(adapter2);
			expect(SwarmAdapter).toHaveBeenCalledTimes(1);
		});

		test("creates new adapter when forceDetection is true", async () => {
			const adapter1 = await OrchestratorFactory.create(swarmServerConfig);
			const adapter2 = await OrchestratorFactory.create(
				swarmServerConfig,
				true,
			);

			expect(adapter1).not.toBe(adapter2);
			expect(SwarmAdapter).toHaveBeenCalledTimes(2);
		});

		test("uses local cache key for local server", async () => {
			const localConfig: ServerConfig = {
				serverId: "",
				name: "local",
				orchestratorType: "swarm",
				ipAddress: "127.0.0.1",
				port: 22,
				username: "root",
			};

			await OrchestratorFactory.create(localConfig);

			const cached = OrchestratorFactory.getCached("local");
			expect(cached).toBeDefined();
		});

		test("auto-detects orchestrator type when not set", async () => {
			const configWithoutType: ServerConfig = {
				serverId: "server-3",
				name: "unknown-server",
				orchestratorType: undefined as any,
				ipAddress: "192.168.1.102",
				port: 22,
				username: "root",
			};

			const adapter = await OrchestratorFactory.create(configWithoutType);

			// Since healthCheck returns healthy for SwarmAdapter mock,
			// it should default to swarm
			expect((adapter as any).type).toBe("swarm");
		});

		test("creates KubernetesAdapter with inCluster when no kubeconfig", async () => {
			const k8sConfigNoKubeconfig: ServerConfig = {
				serverId: "server-4",
				name: "k8s-in-cluster",
				orchestratorType: "kubernetes",
				ipAddress: "192.168.1.103",
				port: 22,
				username: "root",
			};

			await OrchestratorFactory.create(k8sConfigNoKubeconfig);

			expect(KubernetesAdapter).toHaveBeenCalledWith({
				inCluster: true,
				kubeconfig: undefined,
				context: undefined,
				namespace: "dokploy",
			});
		});
	});

	describe("forApplication()", () => {
		test("creates adapter for application's server", async () => {
			(db.query.applications.findFirst as any).mockResolvedValue({
				applicationId: "app-1",
				server: {
					serverId: "server-1",
					name: "test-server",
					orchestratorType: "swarm",
					ipAddress: "192.168.1.100",
					port: 22,
					username: "root",
				},
			});

			const adapter = await OrchestratorFactory.forApplication("app-1");

			expect((adapter as any).type).toBe("swarm");
		});

		test("creates local adapter when application has no server", async () => {
			(db.query.applications.findFirst as any).mockResolvedValue({
				applicationId: "app-2",
				server: null,
			});

			const adapter = await OrchestratorFactory.forApplication("app-2");

			expect(SwarmAdapter).toHaveBeenCalledWith(
				expect.objectContaining({
					serverId: "",
					name: "local",
					orchestratorType: "swarm",
				}),
			);
		});

		test("throws error when application not found", async () => {
			(db.query.applications.findFirst as any).mockResolvedValue(null);

			await expect(
				OrchestratorFactory.forApplication("non-existent"),
			).rejects.toThrow("Application not found");
		});
	});

	describe("forServer()", () => {
		test("creates adapter for server by ID", async () => {
			(db.query.server.findFirst as any).mockResolvedValue({
				serverId: "server-1",
				name: "test-server",
				orchestratorType: "kubernetes",
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
				k8sNamespace: "dokploy",
			});

			const adapter = await OrchestratorFactory.forServer("server-1");

			expect((adapter as any).type).toBe("kubernetes");
		});

		test("creates local swarm adapter when serverId is null", async () => {
			const adapter = await OrchestratorFactory.forServer(null);

			expect(SwarmAdapter).toHaveBeenCalledWith(
				expect.objectContaining({
					serverId: "",
					orchestratorType: "swarm",
				}),
			);
		});

		test("throws error when server not found", async () => {
			(db.query.server.findFirst as any).mockResolvedValue(null);

			await expect(
				OrchestratorFactory.forServer("non-existent"),
			).rejects.toThrow("Server not found");
		});
	});

	describe("detectOrchestrator()", () => {
		test("returns kubernetes when K8s config is provided and valid", async () => {
			const config: ServerConfig = {
				serverId: "server-1",
				name: "k8s-server",
				orchestratorType: undefined as any,
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
				k8sKubeconfig: "valid-config",
			};

			const result = await OrchestratorFactory.detectOrchestrator(config);

			expect(result).toBe("kubernetes");
		});

		test("returns swarm when swarm health check passes", async () => {
			const config: ServerConfig = {
				serverId: "server-1",
				name: "swarm-server",
				orchestratorType: undefined as any,
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
			};

			const result = await OrchestratorFactory.detectOrchestrator(config);

			expect(result).toBe("swarm");
		});

		test("defaults to swarm when both detections fail", async () => {
			// Mock SwarmAdapter to fail health check
			(SwarmAdapter as any).mockImplementationOnce(() => ({
				healthCheck: vi.fn().mockResolvedValue({ healthy: false }),
			}));

			const config: ServerConfig = {
				serverId: "server-1",
				name: "unknown-server",
				orchestratorType: undefined as any,
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
			};

			const result = await OrchestratorFactory.detectOrchestrator(config);

			expect(result).toBe("swarm");
		});
	});

	describe("detectK8sCapabilities()", () => {
		test("detects HPA support from 404 error", async () => {
			const mockAdapter = {
				getHPAStatus: vi.fn().mockRejectedValue(new Error("404 Not Found")),
				getMetrics: vi.fn().mockResolvedValue(null),
				getNetworkPolicy: vi.fn().mockRejectedValue(new Error("404 Not Found")),
				getCustomResource: vi
					.fn()
					.mockRejectedValue(new Error("404 Not Found")),
			};

			const result = await OrchestratorFactory.detectK8sCapabilities(
				mockAdapter as any,
			);

			expect(result.supportsHPA).toBe(true);
			expect(result.supportsNetworkPolicies).toBe(true);
		});

		test("detects no HPA support from non-404 error", async () => {
			const mockAdapter = {
				getHPAStatus: vi
					.fn()
					.mockRejectedValue(new Error("Connection refused")),
				getMetrics: vi.fn().mockResolvedValue(null),
				getNetworkPolicy: vi
					.fn()
					.mockRejectedValue(new Error("Connection refused")),
				getCustomResource: vi
					.fn()
					.mockRejectedValue(new Error("Connection refused")),
			};

			const result = await OrchestratorFactory.detectK8sCapabilities(
				mockAdapter as any,
			);

			expect(result.supportsHPA).toBe(false);
			expect(result.supportsNetworkPolicies).toBe(false);
		});

		test("detects Traefik ingress controller from 404 error", async () => {
			const mockAdapter = {
				getHPAStatus: vi.fn().mockRejectedValue(new Error("404")),
				getMetrics: vi.fn().mockResolvedValue(null),
				getNetworkPolicy: vi.fn().mockRejectedValue(new Error("404")),
				getCustomResource: vi
					.fn()
					.mockRejectedValue(new Error("404 Not Found")),
			};

			const result = await OrchestratorFactory.detectK8sCapabilities(
				mockAdapter as any,
			);

			expect(result.ingressController).toBe("traefik");
		});
	});

	describe("clearCache()", () => {
		test("clears all cache when no serverId provided", async () => {
			const config1: ServerConfig = {
				serverId: "server-1",
				name: "server1",
				orchestratorType: "swarm",
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
			};
			const config2: ServerConfig = {
				serverId: "server-2",
				name: "server2",
				orchestratorType: "swarm",
				ipAddress: "192.168.1.101",
				port: 22,
				username: "root",
			};

			await OrchestratorFactory.create(config1);
			await OrchestratorFactory.create(config2);

			OrchestratorFactory.clearCache();

			expect(OrchestratorFactory.getCached("server-1")).toBeUndefined();
			expect(OrchestratorFactory.getCached("server-2")).toBeUndefined();
		});

		test("clears specific server cache when serverId provided", async () => {
			const config1: ServerConfig = {
				serverId: "server-1",
				name: "server1",
				orchestratorType: "swarm",
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
			};
			const config2: ServerConfig = {
				serverId: "server-2",
				name: "server2",
				orchestratorType: "swarm",
				ipAddress: "192.168.1.101",
				port: 22,
				username: "root",
			};

			await OrchestratorFactory.create(config1);
			await OrchestratorFactory.create(config2);

			OrchestratorFactory.clearCache("server-1");

			expect(OrchestratorFactory.getCached("server-1")).toBeUndefined();
			expect(OrchestratorFactory.getCached("server-2")).toBeDefined();
		});
	});

	describe("getCached()", () => {
		test("returns cached adapter", async () => {
			const config: ServerConfig = {
				serverId: "server-1",
				name: "test-server",
				orchestratorType: "swarm",
				ipAddress: "192.168.1.100",
				port: 22,
				username: "root",
			};

			const adapter = await OrchestratorFactory.create(config);
			const cached = OrchestratorFactory.getCached("server-1");

			expect(cached).toBe(adapter);
		});

		test("returns undefined for non-cached server", () => {
			const cached = OrchestratorFactory.getCached("non-existent");
			expect(cached).toBeUndefined();
		});
	});

	describe("isKubernetes()", () => {
		test("returns true when server uses kubernetes", async () => {
			(db.query.server.findFirst as any).mockResolvedValue({
				orchestratorType: "kubernetes",
			});

			const result = await OrchestratorFactory.isKubernetes("server-1");
			expect(result).toBe(true);
		});

		test("returns false when server uses swarm", async () => {
			(db.query.server.findFirst as any).mockResolvedValue({
				orchestratorType: "swarm",
			});

			const result = await OrchestratorFactory.isKubernetes("server-1");
			expect(result).toBe(false);
		});

		test("returns false for null serverId", async () => {
			const result = await OrchestratorFactory.isKubernetes(null);
			expect(result).toBe(false);
		});
	});

	describe("isSwarm()", () => {
		test("returns true when server uses swarm", async () => {
			(db.query.server.findFirst as any).mockResolvedValue({
				orchestratorType: "swarm",
			});

			const result = await OrchestratorFactory.isSwarm("server-1");
			expect(result).toBe(true);
		});

		test("returns false when server uses kubernetes", async () => {
			(db.query.server.findFirst as any).mockResolvedValue({
				orchestratorType: "kubernetes",
			});

			const result = await OrchestratorFactory.isSwarm("server-1");
			expect(result).toBe(false);
		});

		test("returns true for null serverId (local is always swarm)", async () => {
			const result = await OrchestratorFactory.isSwarm(null);
			expect(result).toBe(true);
		});
	});
});
