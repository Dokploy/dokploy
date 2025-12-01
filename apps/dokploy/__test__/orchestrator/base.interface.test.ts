/**
 * Unit tests for IOrchestratorAdapter type guards
 */

import { describe, expect, test, vi } from "vitest";
import {
	supportsHPA,
	supportsNetworkPolicies,
	supportsCustomResources,
	supportsNamespaces,
	type IOrchestratorAdapter,
} from "@dokploy/server/services/orchestrator";

// Mock adapter that only implements base methods
const createBaseAdapter = (): IOrchestratorAdapter => ({
	detect: vi.fn(),
	healthCheck: vi.fn(),
	getVersion: vi.fn(),
	deployApplication: vi.fn(),
	getDeployment: vi.fn(),
	scaleApplication: vi.fn(),
	updateApplication: vi.fn(),
	deleteApplication: vi.fn(),
	rollbackApplication: vi.fn(),
	restartApplication: vi.fn(),
	listDeployments: vi.fn(),
	createService: vi.fn(),
	getService: vi.fn(),
	updateService: vi.fn(),
	deleteService: vi.fn(),
	configureIngress: vi.fn(),
	getIngress: vi.fn(),
	deleteIngress: vi.fn(),
	getMetrics: vi.fn(),
	getLogs: vi.fn(),
	streamLogs: vi.fn(),
	getEvents: vi.fn(),
});

describe("IOrchestratorAdapter Type Guards", () => {
	describe("supportsHPA", () => {
		test("returns false when HPA methods are not implemented", () => {
			const adapter = createBaseAdapter();
			expect(supportsHPA(adapter)).toBe(false);
		});

		test("returns false when only some HPA methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				configureHPA: vi.fn(),
			};
			expect(supportsHPA(adapter)).toBe(false);
		});

		test("returns true when all HPA methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				configureHPA: vi.fn(),
				getHPAStatus: vi.fn(),
				deleteHPA: vi.fn(),
			};
			expect(supportsHPA(adapter)).toBe(true);
		});
	});

	describe("supportsNetworkPolicies", () => {
		test("returns false when network policy methods are not implemented", () => {
			const adapter = createBaseAdapter();
			expect(supportsNetworkPolicies(adapter)).toBe(false);
		});

		test("returns false when only some network policy methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				createNetworkPolicy: vi.fn(),
			};
			expect(supportsNetworkPolicies(adapter)).toBe(false);
		});

		test("returns true when all network policy methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				createNetworkPolicy: vi.fn(),
				getNetworkPolicy: vi.fn(),
				deleteNetworkPolicy: vi.fn(),
			};
			expect(supportsNetworkPolicies(adapter)).toBe(true);
		});
	});

	describe("supportsCustomResources", () => {
		test("returns false when custom resource methods are not implemented", () => {
			const adapter = createBaseAdapter();
			expect(supportsCustomResources(adapter)).toBe(false);
		});

		test("returns false when only some custom resource methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				createCustomResource: vi.fn(),
				getCustomResource: vi.fn(),
			};
			expect(supportsCustomResources(adapter)).toBe(false);
		});

		test("returns true when all custom resource methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				createCustomResource: vi.fn(),
				getCustomResource: vi.fn(),
				deleteCustomResource: vi.fn(),
			};
			expect(supportsCustomResources(adapter)).toBe(true);
		});
	});

	describe("supportsNamespaces", () => {
		test("returns false when namespace methods are not implemented", () => {
			const adapter = createBaseAdapter();
			expect(supportsNamespaces(adapter)).toBe(false);
		});

		test("returns false when only some namespace methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				ensureNamespace: vi.fn(),
			};
			expect(supportsNamespaces(adapter)).toBe(false);
		});

		test("returns true when all namespace methods are implemented", () => {
			const adapter = {
				...createBaseAdapter(),
				ensureNamespace: vi.fn(),
				listNamespaces: vi.fn(),
			};
			expect(supportsNamespaces(adapter)).toBe(true);
		});
	});

	describe("Type guard combinations", () => {
		test("SwarmAdapter should not support K8s-specific features", () => {
			const swarmAdapter = createBaseAdapter();

			expect(supportsHPA(swarmAdapter)).toBe(false);
			expect(supportsNetworkPolicies(swarmAdapter)).toBe(false);
			expect(supportsCustomResources(swarmAdapter)).toBe(false);
			expect(supportsNamespaces(swarmAdapter)).toBe(false);
		});

		test("KubernetesAdapter should support all K8s-specific features", () => {
			const k8sAdapter = {
				...createBaseAdapter(),
				// HPA
				configureHPA: vi.fn(),
				getHPAStatus: vi.fn(),
				deleteHPA: vi.fn(),
				// Network Policies
				createNetworkPolicy: vi.fn(),
				getNetworkPolicy: vi.fn(),
				deleteNetworkPolicy: vi.fn(),
				// Custom Resources
				createCustomResource: vi.fn(),
				getCustomResource: vi.fn(),
				deleteCustomResource: vi.fn(),
				// Namespaces
				ensureNamespace: vi.fn(),
				listNamespaces: vi.fn(),
			};

			expect(supportsHPA(k8sAdapter)).toBe(true);
			expect(supportsNetworkPolicies(k8sAdapter)).toBe(true);
			expect(supportsCustomResources(k8sAdapter)).toBe(true);
			expect(supportsNamespaces(k8sAdapter)).toBe(true);
		});
	});
});
