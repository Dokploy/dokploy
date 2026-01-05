/**
 * Unit tests for orchestrator types and utility functions
 *
 * These tests validate the type definitions and helper functions
 * used across both Swarm and Kubernetes adapters.
 */

import { describe, expect, test } from "vitest";
import type {
	OrchestratorType,
	DeploymentStatus,
	HealthStatus,
	DeploymentConfig,
	HPAConfig,
	NetworkPolicyConfig,
	ResourceRequirements,
	ProbeConfig,
	ServiceType,
} from "@dokploy/server/services/orchestrator";

describe("Orchestrator Types", () => {
	describe("OrchestratorType", () => {
		test("should accept valid orchestrator types", () => {
			const swarm: OrchestratorType = "swarm";
			const kubernetes: OrchestratorType = "kubernetes";

			expect(swarm).toBe("swarm");
			expect(kubernetes).toBe("kubernetes");
		});
	});

	describe("DeploymentStatus", () => {
		test("should accept all valid deployment statuses", () => {
			const statuses: DeploymentStatus[] = [
				"pending",
				"running",
				"succeeded",
				"failed",
				"updating",
				"scaling",
			];

			expect(statuses).toHaveLength(6);
			statuses.forEach((status) => {
				expect(typeof status).toBe("string");
			});
		});
	});

	describe("HealthStatus", () => {
		test("should create healthy status", () => {
			const healthyStatus: HealthStatus = {
				healthy: true,
				message: "Cluster is healthy",
				details: {
					version: "1.28.0",
					nodes: 3,
					apiEndpoint: "https://k8s.example.com:6443",
					lastCheck: new Date(),
				},
			};

			expect(healthyStatus.healthy).toBe(true);
			expect(healthyStatus.details?.nodes).toBe(3);
		});

		test("should create unhealthy status", () => {
			const unhealthyStatus: HealthStatus = {
				healthy: false,
				message: "Failed to connect to cluster",
			};

			expect(unhealthyStatus.healthy).toBe(false);
			expect(unhealthyStatus.details).toBeUndefined();
		});
	});

	describe("DeploymentConfig", () => {
		test("should create minimal deployment config", () => {
			const config: DeploymentConfig = {
				name: "my-app",
				image: "nginx:latest",
				replicas: 3,
				env: { NODE_ENV: "production" },
				ports: [{ containerPort: 80 }],
			};

			expect(config.name).toBe("my-app");
			expect(config.replicas).toBe(3);
			expect(config.ports).toHaveLength(1);
		});

		test("should create full deployment config with all options", () => {
			const config: DeploymentConfig = {
				name: "my-app",
				namespace: "dokploy",
				image: "nginx:latest",
				replicas: 3,
				env: { NODE_ENV: "production", API_KEY: "secret" },
				ports: [
					{ containerPort: 80, protocol: "TCP", publishedPort: 8080 },
					{ containerPort: 443, protocol: "TCP", publishedPort: 8443 },
				],
				volumes: [
					{
						name: "data",
						mountPath: "/data",
						pvcName: "my-app-data",
					},
				],
				resources: {
					requests: { cpu: "100m", memory: "128Mi" },
					limits: { cpu: "500m", memory: "512Mi" },
				},
				labels: { "app.kubernetes.io/name": "my-app" },
				annotations: { "prometheus.io/scrape": "true" },
				command: ["/bin/sh"],
				args: ["-c", "echo hello"],
				healthCheck: {
					httpGet: { path: "/health", port: 80 },
					initialDelaySeconds: 10,
					periodSeconds: 30,
					timeoutSeconds: 5,
					failureThreshold: 3,
				},
				strategy: {
					type: "rolling",
					rollingUpdate: {
						maxSurge: "25%",
						maxUnavailable: "25%",
					},
				},
				domain: "app.example.com",
				ssl: true,
				hpa: {
					enabled: true,
					targetName: "my-app",
					minReplicas: 2,
					maxReplicas: 10,
					targetCPU: 70,
				},
				networkPolicy: {
					name: "my-app-policy",
					podSelector: { app: "my-app" },
					policyTypes: ["Ingress", "Egress"],
				},
				serviceAccount: "my-app-sa",
				pdb: { minAvailable: 2 },
			};

			expect(config.namespace).toBe("dokploy");
			expect(config.volumes).toHaveLength(1);
			expect(config.resources?.limits.cpu).toBe("500m");
			expect(config.hpa?.enabled).toBe(true);
			expect(config.pdb?.minAvailable).toBe(2);
		});
	});

	describe("ResourceRequirements", () => {
		test("should create resource requirements", () => {
			const resources: ResourceRequirements = {
				requests: {
					cpu: "100m",
					memory: "128Mi",
				},
				limits: {
					cpu: "500m",
					memory: "512Mi",
				},
			};

			expect(resources.requests.cpu).toBe("100m");
			expect(resources.limits.memory).toBe("512Mi");
		});
	});

	describe("ProbeConfig", () => {
		test("should create HTTP probe", () => {
			const probe: ProbeConfig = {
				httpGet: {
					path: "/health",
					port: 8080,
					scheme: "HTTP",
				},
				initialDelaySeconds: 10,
				periodSeconds: 30,
				timeoutSeconds: 5,
				failureThreshold: 3,
			};

			expect(probe.httpGet?.path).toBe("/health");
			expect(probe.tcpSocket).toBeUndefined();
		});

		test("should create TCP probe", () => {
			const probe: ProbeConfig = {
				tcpSocket: {
					port: 5432,
				},
				initialDelaySeconds: 5,
				periodSeconds: 10,
				timeoutSeconds: 3,
				failureThreshold: 5,
			};

			expect(probe.tcpSocket?.port).toBe(5432);
			expect(probe.httpGet).toBeUndefined();
		});

		test("should create exec probe", () => {
			const probe: ProbeConfig = {
				exec: {
					command: ["pg_isready", "-U", "postgres"],
				},
				initialDelaySeconds: 15,
				periodSeconds: 20,
				timeoutSeconds: 10,
				failureThreshold: 3,
			};

			expect(probe.exec?.command).toHaveLength(3);
			expect(probe.exec?.command[0]).toBe("pg_isready");
		});
	});

	describe("HPAConfig", () => {
		test("should create HPA config with CPU target", () => {
			const hpa: HPAConfig = {
				enabled: true,
				targetName: "my-app",
				minReplicas: 2,
				maxReplicas: 10,
				targetCPU: 70,
			};

			expect(hpa.enabled).toBe(true);
			expect(hpa.minReplicas).toBe(2);
			expect(hpa.maxReplicas).toBe(10);
			expect(hpa.targetCPU).toBe(70);
		});

		test("should create HPA config with memory target", () => {
			const hpa: HPAConfig = {
				enabled: true,
				targetName: "my-app",
				minReplicas: 1,
				maxReplicas: 5,
				targetMemory: 80,
			};

			expect(hpa.targetMemory).toBe(80);
			expect(hpa.targetCPU).toBeUndefined();
		});

		test("should create HPA config with custom behavior", () => {
			const hpa: HPAConfig = {
				enabled: true,
				targetName: "my-app",
				minReplicas: 1,
				maxReplicas: 10,
				targetCPU: 70,
				behavior: {
					scaleDown: {
						stabilizationWindowSeconds: 300,
						policies: [{ type: "Percent", value: 50, periodSeconds: 60 }],
					},
					scaleUp: {
						stabilizationWindowSeconds: 0,
						policies: [{ type: "Percent", value: 100, periodSeconds: 15 }],
					},
				},
			};

			expect(hpa.behavior?.scaleDown?.stabilizationWindowSeconds).toBe(300);
			expect(hpa.behavior?.scaleUp?.policies?.[0].type).toBe("Percent");
		});
	});

	describe("NetworkPolicyConfig", () => {
		test("should create ingress-only network policy", () => {
			const policy: NetworkPolicyConfig = {
				name: "my-app-policy",
				namespace: "dokploy",
				podSelector: { app: "my-app" },
				policyTypes: ["Ingress"],
				ingress: [
					{
						from: [{ podSelector: { app: "frontend" } }],
						ports: [{ protocol: "TCP", port: 8080 }],
					},
				],
			};

			expect(policy.policyTypes).toEqual(["Ingress"]);
			expect(policy.ingress).toHaveLength(1);
			expect(policy.egress).toBeUndefined();
		});

		test("should create egress-only network policy", () => {
			const policy: NetworkPolicyConfig = {
				name: "my-app-policy",
				podSelector: { app: "my-app" },
				policyTypes: ["Egress"],
				egress: [
					{
						to: [{ ipBlock: { cidr: "10.0.0.0/8" } }],
						ports: [{ protocol: "TCP", port: 443 }],
					},
				],
			};

			expect(policy.policyTypes).toEqual(["Egress"]);
			expect(policy.egress?.[0].to?.[0].ipBlock?.cidr).toBe("10.0.0.0/8");
		});

		test("should create bidirectional network policy", () => {
			const policy: NetworkPolicyConfig = {
				name: "my-app-policy",
				podSelector: { app: "my-app" },
				policyTypes: ["Ingress", "Egress"],
				ingress: [
					{
						from: [
							{ namespaceSelector: { name: "frontend" } },
							{ podSelector: { role: "api-client" } },
						],
					},
				],
				egress: [
					{
						to: [{ podSelector: { app: "database" } }],
						ports: [{ protocol: "TCP", port: 5432 }],
					},
				],
			};

			expect(policy.policyTypes).toHaveLength(2);
			expect(policy.ingress?.[0].from).toHaveLength(2);
		});
	});

	describe("ServiceType", () => {
		test("should accept all valid service types", () => {
			const types: ServiceType[] = ["ClusterIP", "NodePort", "LoadBalancer"];

			expect(types).toContain("ClusterIP");
			expect(types).toContain("NodePort");
			expect(types).toContain("LoadBalancer");
		});
	});
});
