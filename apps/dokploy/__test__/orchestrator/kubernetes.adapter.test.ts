/**
 * Unit tests for KubernetesAdapter - Structure and Interface Tests
 *
 * These tests validate the Kubernetes adapter structure and interface compliance.
 *
 * Note: The @kubernetes/client-node library is challenging to mock in unit tests
 * due to its internal architecture. Full functional testing requires:
 * - Integration tests with kind/minikube
 * - API mocking at the HTTP level (using nock)
 * - Test containers with a real K8s cluster
 *
 * These tests focus on:
 * - Interface compliance (all required methods exist)
 * - Type guard validation
 */

import { describe, expect, test, vi, beforeAll, afterAll } from "vitest";
import type { K8sAdapterConfig } from "@dokploy/server/services/orchestrator";
import {
	supportsHPA,
	supportsNetworkPolicies,
	supportsCustomResources,
	supportsNamespaces,
} from "@dokploy/server/services/orchestrator";

// We need to properly mock the kubernetes client before importing the adapter
// Using a factory function to avoid vitest hoisting issues
vi.mock("@kubernetes/client-node", () => {
	// Create proper mock classes that don't throw
	class MockKubeConfig {
		loadFromCluster = vi.fn();
		loadFromString = vi.fn();
		loadFromFile = vi.fn();
		loadFromDefault = vi.fn();
		setCurrentContext = vi.fn();
		getCurrentCluster = vi.fn(() => ({ server: "https://mock.k8s.local:6443" }));
		makeApiClient = vi.fn(() => ({}));
	}

	return {
		KubeConfig: MockKubeConfig,
		AppsV1Api: class {},
		CoreV1Api: class {},
		AutoscalingV2Api: class {},
		NetworkingV1Api: class {},
		CustomObjectsApi: class {},
		PolicyV1Api: class {},
		VersionApi: class {},
		Metrics: class {},
		Log: class {
			log = vi.fn();
		},
	};
});

// Import after mock is set up
import { KubernetesAdapter } from "@dokploy/server/services/orchestrator/kubernetes.adapter";

describe("KubernetesAdapter", () => {
	const mockConfig: K8sAdapterConfig = {
		namespace: "dokploy",
		inCluster: true, // Use inCluster to avoid file access
	};

	let adapter: KubernetesAdapter;

	beforeAll(() => {
		adapter = new KubernetesAdapter(mockConfig);
	});

	describe("KubernetesAdapter - Type guard checks", () => {
		test("implements HPA methods", () => {
			expect(adapter.configureHPA).toBeDefined();
			expect(adapter.getHPAStatus).toBeDefined();
			expect(adapter.deleteHPA).toBeDefined();
		});

		test("implements network policy methods", () => {
			expect(adapter.createNetworkPolicy).toBeDefined();
			expect(adapter.getNetworkPolicy).toBeDefined();
			expect(adapter.deleteNetworkPolicy).toBeDefined();
		});

		test("implements custom resource methods", () => {
			expect(adapter.createCustomResource).toBeDefined();
			expect(adapter.getCustomResource).toBeDefined();
			expect(adapter.deleteCustomResource).toBeDefined();
		});

		test("implements namespace methods", () => {
			expect(adapter.ensureNamespace).toBeDefined();
			expect(adapter.listNamespaces).toBeDefined();
		});

		test("passes type guard supportsHPA", () => {
			expect(supportsHPA(adapter)).toBe(true);
		});

		test("passes type guard supportsNetworkPolicies", () => {
			expect(supportsNetworkPolicies(adapter)).toBe(true);
		});

		test("passes type guard supportsCustomResources", () => {
			expect(supportsCustomResources(adapter)).toBe(true);
		});

		test("passes type guard supportsNamespaces", () => {
			expect(supportsNamespaces(adapter)).toBe(true);
		});
	});

	describe("KubernetesAdapter - Interface compliance", () => {
		test("has all required IOrchestratorAdapter methods", () => {
			// Core methods
			expect(adapter.detect).toBeDefined();
			expect(adapter.healthCheck).toBeDefined();
			expect(adapter.getVersion).toBeDefined();

			// Deployment management
			expect(adapter.deployApplication).toBeDefined();
			expect(adapter.getDeployment).toBeDefined();
			expect(adapter.scaleApplication).toBeDefined();
			expect(adapter.updateApplication).toBeDefined();
			expect(adapter.deleteApplication).toBeDefined();
			expect(adapter.rollbackApplication).toBeDefined();
			expect(adapter.restartApplication).toBeDefined();
			expect(adapter.listDeployments).toBeDefined();

			// Service management
			expect(adapter.createService).toBeDefined();
			expect(adapter.getService).toBeDefined();
			expect(adapter.updateService).toBeDefined();
			expect(adapter.deleteService).toBeDefined();

			// Ingress management
			expect(adapter.configureIngress).toBeDefined();
			expect(adapter.getIngress).toBeDefined();
			expect(adapter.deleteIngress).toBeDefined();

			// Monitoring
			expect(adapter.getMetrics).toBeDefined();
			expect(adapter.getLogs).toBeDefined();
			expect(adapter.streamLogs).toBeDefined();
			expect(adapter.getEvents).toBeDefined();
		});

		test("all methods are functions", () => {
			const methods = [
				"detect",
				"healthCheck",
				"getVersion",
				"deployApplication",
				"getDeployment",
				"scaleApplication",
				"updateApplication",
				"deleteApplication",
				"rollbackApplication",
				"restartApplication",
				"listDeployments",
				"createService",
				"getService",
				"updateService",
				"deleteService",
				"configureIngress",
				"getIngress",
				"deleteIngress",
				"getMetrics",
				"getLogs",
				"streamLogs",
				"getEvents",
				"configureHPA",
				"getHPAStatus",
				"deleteHPA",
				"createNetworkPolicy",
				"getNetworkPolicy",
				"deleteNetworkPolicy",
				"createCustomResource",
				"getCustomResource",
				"deleteCustomResource",
				"ensureNamespace",
				"listNamespaces",
			];

			for (const method of methods) {
				expect(typeof (adapter as any)[method]).toBe("function");
			}
		});
	});

	describe("KubernetesAdapter - Contrast with SwarmAdapter", () => {
		test("KubernetesAdapter supports K8s-only features that SwarmAdapter does not", () => {
			// K8s adapter should support all K8s-specific features
			expect(supportsHPA(adapter)).toBe(true);
			expect(supportsNetworkPolicies(adapter)).toBe(true);
			expect(supportsCustomResources(adapter)).toBe(true);
			expect(supportsNamespaces(adapter)).toBe(true);
		});
	});

	describe("KubernetesAdapter - Configuration", () => {
		test("stores namespace in config", () => {
			expect((adapter as any).config.namespace).toBe("dokploy");
		});
	});
});
