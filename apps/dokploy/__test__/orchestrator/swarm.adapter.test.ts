/**
 * Unit tests for SwarmAdapter
 *
 * These tests validate the Docker Swarm adapter implementation
 * using mocked Docker client.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import type {
	DeploymentConfig,
	ServerConfig,
} from "@dokploy/server/services/orchestrator";

// Mock the remote docker utility
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn(),
}));

// Mock the exec utilities
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

// Import after mocking
import { SwarmAdapter } from "@dokploy/server/services/orchestrator/swarm.adapter";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import {
	execAsync,
	execAsyncRemote,
} from "@dokploy/server/utils/process/execAsync";

describe("SwarmAdapter", () => {
	const mockServerConfig: ServerConfig = {
		serverId: "test-server-id",
		name: "test-server",
		orchestratorType: "swarm",
		ipAddress: "192.168.1.100",
		port: 22,
		username: "root",
	};

	const mockLocalServerConfig: ServerConfig = {
		serverId: "",
		name: "local",
		orchestratorType: "swarm",
		ipAddress: "127.0.0.1",
		port: 22,
		username: "root",
	};

	let adapter: SwarmAdapter;
	let mockDocker: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock Docker client
		mockDocker = {
			swarmInspect: vi.fn(),
			info: vi.fn(),
			createService: vi.fn(),
			listServices: vi.fn(),
			listTasks: vi.fn(),
			getService: vi.fn(),
			getContainer: vi.fn(),
		};

		(getRemoteDocker as any).mockResolvedValue(mockDocker);
	});

	describe("detect()", () => {
		test("returns swarm when swarm is active", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.swarmInspect.mockResolvedValue({ ID: "swarm-id-123" });

			const result = await adapter.detect();
			expect(result).toBe("swarm");
		});

		test("returns swarm even when swarm inspection fails", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.swarmInspect.mockRejectedValue(new Error("Not a swarm node"));

			const result = await adapter.detect();
			expect(result).toBe("swarm");
		});
	});

	describe("healthCheck()", () => {
		test("returns healthy status when swarm is active", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.info.mockResolvedValue({
				Swarm: {
					LocalNodeState: "active",
					Nodes: 3,
				},
				ServerVersion: "24.0.5",
			});

			const result = await adapter.healthCheck();

			expect(result.healthy).toBe(true);
			expect(result.message).toBe("Docker Swarm is healthy");
			expect(result.details?.version).toBe("24.0.5");
			expect(result.details?.nodes).toBe(3);
		});

		test("returns unhealthy status when swarm is not active", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.info.mockResolvedValue({
				Swarm: {
					LocalNodeState: "inactive",
				},
			});

			const result = await adapter.healthCheck();

			expect(result.healthy).toBe(false);
			expect(result.message).toBe("Docker Swarm is not active");
		});

		test("returns unhealthy status on connection failure", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.info.mockRejectedValue(new Error("Connection refused"));

			const result = await adapter.healthCheck();

			expect(result.healthy).toBe(false);
			expect(result.message).toContain("Failed to connect to Docker");
		});
	});

	describe("getVersion()", () => {
		test("returns server version", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.info.mockResolvedValue({
				ServerVersion: "24.0.5",
			});

			const result = await adapter.getVersion();
			expect(result).toBe("24.0.5");
		});

		test("returns unknown when version is not available", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.info.mockResolvedValue({});

			const result = await adapter.getVersion();
			expect(result).toBe("unknown");
		});
	});

	describe("getDeployment()", () => {
		test("returns deployment info when service exists", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockResolvedValue({
					Spec: {
						Mode: {
							Replicated: { Replicas: 3 },
						},
						TaskTemplate: {
							ContainerSpec: {
								Image: "nginx:latest",
							},
						},
					},
					CreatedAt: "2024-01-01T00:00:00Z",
					UpdatedAt: "2024-01-02T00:00:00Z",
				}),
			};

			mockDocker.getService.mockReturnValue(mockService);
			mockDocker.listTasks.mockResolvedValue([
				{ Status: { State: "running" } },
				{ Status: { State: "running" } },
				{ Status: { State: "running" } },
			]);

			const result = await adapter.getDeployment("my-app");

			expect(result).not.toBeNull();
			expect(result?.name).toBe("my-app");
			expect(result?.status).toBe("running");
			expect(result?.replicas.desired).toBe(3);
			expect(result?.replicas.ready).toBe(3);
			expect(result?.image).toBe("nginx:latest");
		});

		test("returns null when service does not exist", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockRejectedValue(new Error("Service not found")),
			};
			mockDocker.getService.mockReturnValue(mockService);

			const result = await adapter.getDeployment("non-existent");
			expect(result).toBeNull();
		});

		test("returns scaling status when replicas are not ready", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockResolvedValue({
					Spec: {
						Mode: {
							Replicated: { Replicas: 5 },
						},
						TaskTemplate: {
							ContainerSpec: {
								Image: "nginx:latest",
							},
						},
					},
					CreatedAt: "2024-01-01T00:00:00Z",
					UpdatedAt: "2024-01-02T00:00:00Z",
				}),
			};

			mockDocker.getService.mockReturnValue(mockService);
			mockDocker.listTasks.mockResolvedValue([
				{ Status: { State: "running" } },
				{ Status: { State: "running" } },
			]);

			const result = await adapter.getDeployment("my-app");

			expect(result?.status).toBe("scaling");
			expect(result?.replicas.desired).toBe(5);
			expect(result?.replicas.ready).toBe(2);
		});
	});

	describe("scaleApplication()", () => {
		test("scales service successfully for remote server", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "scaled 5/5 converged",
				stderr: "",
			});

			await adapter.scaleApplication("my-app", 5);

			expect(execAsyncRemote).toHaveBeenCalledWith(
				mockServerConfig.serverId,
				"docker service scale my-app=5",
			);
		});

		test("scales service successfully for local server", async () => {
			adapter = new SwarmAdapter(mockLocalServerConfig);
			(execAsync as any).mockResolvedValue({
				stdout: "scaled 3/3 converged",
				stderr: "",
			});

			await adapter.scaleApplication("my-app", 3);

			expect(execAsync).toHaveBeenCalledWith("docker service scale my-app=3");
		});

		test("throws error when scaling fails", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "",
				stderr: "Error: No such service: my-app",
			});

			await expect(adapter.scaleApplication("my-app", 5)).rejects.toThrow(
				"Failed to scale service",
			);
		});
	});

	describe("deleteApplication()", () => {
		test("deletes service successfully", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "my-app",
				stderr: "",
			});

			await adapter.deleteApplication("my-app");

			expect(execAsyncRemote).toHaveBeenCalledWith(
				mockServerConfig.serverId,
				"docker service rm my-app",
			);
		});

		test("does not throw when service not found", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "",
				stderr: "Error response from daemon: service my-app not found",
			});

			// Should not throw
			await expect(adapter.deleteApplication("my-app")).resolves.not.toThrow();
		});
	});

	describe("rollbackApplication()", () => {
		test("rollbacks service successfully", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "my-app rollback complete",
				stderr: "",
			});

			await adapter.rollbackApplication("my-app");

			expect(execAsyncRemote).toHaveBeenCalledWith(
				mockServerConfig.serverId,
				"docker service rollback my-app",
			);
		});
	});

	describe("restartApplication()", () => {
		test("restarts service by force updating", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockResolvedValue({
					Version: { Index: 1 },
					Spec: {
						TaskTemplate: {
							ForceUpdate: 0,
						},
					},
				}),
				update: vi.fn().mockResolvedValue({}),
			};
			mockDocker.getService.mockReturnValue(mockService);

			await adapter.restartApplication("my-app");

			expect(mockService.update).toHaveBeenCalledWith(
				expect.objectContaining({
					version: 1,
					TaskTemplate: expect.objectContaining({
						ForceUpdate: 1,
					}),
				}),
			);
		});
	});

	describe("listDeployments()", () => {
		test("returns list of deployments", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			mockDocker.listServices.mockResolvedValue([
				{ Spec: { Name: "app-1" } },
				{ Spec: { Name: "app-2" } },
			]);

			// Mock getService for each service
			const mockServiceInspect = {
				inspect: vi.fn().mockResolvedValue({
					Spec: {
						Mode: { Replicated: { Replicas: 1 } },
						TaskTemplate: { ContainerSpec: { Image: "nginx:latest" } },
					},
					CreatedAt: new Date().toISOString(),
					UpdatedAt: new Date().toISOString(),
				}),
			};
			mockDocker.getService.mockReturnValue(mockServiceInspect);
			mockDocker.listTasks.mockResolvedValue([
				{ Status: { State: "running" } },
			]);

			const result = await adapter.listDeployments();

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("app-1");
			expect(result[1].name).toBe("app-2");
		});

		test("filters by label selector", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			mockDocker.listServices.mockResolvedValue([]);

			await adapter.listDeployments(undefined, "app=my-app");

			expect(mockDocker.listServices).toHaveBeenCalledWith({
				filters: JSON.stringify({ label: ["app=my-app"] }),
			});
		});
	});

	describe("getLogs()", () => {
		test("returns logs from service", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "Line 1\nLine 2\nLine 3",
				stderr: "",
			});

			const result = await adapter.getLogs("my-app", { tailLines: 100 });

			expect(result).toEqual(["Line 1", "Line 2", "Line 3"]);
			expect(execAsyncRemote).toHaveBeenCalledWith(
				mockServerConfig.serverId,
				expect.stringContaining("docker service logs my-app --tail 100"),
			);
		});

		test("includes timestamps when requested", async () => {
			adapter = new SwarmAdapter(mockServerConfig);
			(execAsyncRemote as any).mockResolvedValue({
				stdout: "2024-01-01T00:00:00 Line 1",
				stderr: "",
			});

			await adapter.getLogs("my-app", { timestamps: true });

			expect(execAsyncRemote).toHaveBeenCalledWith(
				mockServerConfig.serverId,
				expect.stringContaining("--timestamps"),
			);
		});
	});

	describe("getService()", () => {
		test("returns service info when service exists", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockResolvedValue({
					Spec: {
						Name: "my-app",
						TaskTemplate: {
							ContainerSpec: {
								Labels: { app: "my-app" },
							},
						},
					},
					Endpoint: {
						Ports: [{ PublishedPort: 8080, TargetPort: 80, Protocol: "tcp" }],
					},
				}),
			};
			mockDocker.getService.mockReturnValue(mockService);

			const result = await adapter.getService("my-app");

			expect(result).not.toBeNull();
			expect(result?.name).toBe("my-app");
			expect(result?.type).toBe("ClusterIP");
			expect(result?.ports).toHaveLength(1);
		});

		test("returns null when service does not exist", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const mockService = {
				inspect: vi.fn().mockRejectedValue(new Error("Not found")),
			};
			mockDocker.getService.mockReturnValue(mockService);

			const result = await adapter.getService("non-existent");
			expect(result).toBeNull();
		});
	});

	describe("getEvents()", () => {
		test("returns task events for service", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			mockDocker.listTasks.mockResolvedValue([
				{
					Status: {
						State: "running",
						Message: "Started successfully",
						Timestamp: new Date().toISOString(),
					},
				},
				{
					Status: {
						State: "failed",
						Message: "Container exited with error",
						Timestamp: new Date().toISOString(),
					},
				},
			]);

			const result = await adapter.getEvents("my-app");

			expect(result).toHaveLength(2);
			expect(result[0].type).toBe("Normal");
			expect(result[0].reason).toBe("running");
			expect(result[1].type).toBe("Warning");
			expect(result[1].reason).toBe("failed");
		});
	});

	describe("configureIngress()", () => {
		test("returns ingress configuration for Traefik", async () => {
			adapter = new SwarmAdapter(mockServerConfig);

			const result = await adapter.configureIngress({
				name: "my-app-ingress",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
				ssl: true,
			});

			expect(result.name).toBe("my-app-ingress");
			expect(result.hosts).toContain("app.example.com");
			expect(result.tls).toBe(true);
			expect(result.rules[0].paths[0].serviceName).toBe("my-app");
		});
	});

	describe("SwarmAdapter - Type guard checks", () => {
		test("does not implement HPA methods", () => {
			adapter = new SwarmAdapter(mockServerConfig);

			expect((adapter as any).configureHPA).toBeUndefined();
			expect((adapter as any).getHPAStatus).toBeUndefined();
			expect((adapter as any).deleteHPA).toBeUndefined();
		});

		test("does not implement network policy methods", () => {
			adapter = new SwarmAdapter(mockServerConfig);

			expect((adapter as any).createNetworkPolicy).toBeUndefined();
			expect((adapter as any).getNetworkPolicy).toBeUndefined();
			expect((adapter as any).deleteNetworkPolicy).toBeUndefined();
		});

		test("does not implement custom resource methods", () => {
			adapter = new SwarmAdapter(mockServerConfig);

			expect((adapter as any).createCustomResource).toBeUndefined();
			expect((adapter as any).getCustomResource).toBeUndefined();
			expect((adapter as any).deleteCustomResource).toBeUndefined();
		});

		test("does not implement namespace methods", () => {
			adapter = new SwarmAdapter(mockServerConfig);

			expect((adapter as any).ensureNamespace).toBeUndefined();
			expect((adapter as any).listNamespaces).toBeUndefined();
		});
	});
});
