/**
 * OrchestratorFactory - Factory Pattern for Auto-Detection
 *
 * This factory automatically detects whether a server is running Docker Swarm
 * or Kubernetes and returns the appropriate adapter instance.
 */

import { db } from "../../db";
import { server as serverTable, applications } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { IOrchestratorAdapter } from "./base.interface";
import { KubernetesAdapter } from "./kubernetes.adapter";
import { SwarmAdapter } from "./swarm.adapter";
import type { K8sAdapterConfig, OrchestratorType, ServerConfig } from "./types";

// Cache for adapter instances (per serverId)
const adapterCache = new Map<string, IOrchestratorAdapter>();

export class OrchestratorFactory {
	/**
	 * Create an orchestrator adapter for a server
	 * Auto-detects the orchestrator type if not explicitly set
	 *
	 * @param serverConfig Server configuration
	 * @param forceDetection Force re-detection even if cached
	 * @returns Orchestrator adapter instance
	 */
	static async create(
		serverConfig: ServerConfig,
		forceDetection = false,
	): Promise<IOrchestratorAdapter> {
		const cacheKey = serverConfig.serverId || "local";

		// Return cached adapter if available
		if (!forceDetection && adapterCache.has(cacheKey)) {
			return adapterCache.get(cacheKey)!;
		}

		// If orchestrator type is already set and is kubernetes
		if (serverConfig.orchestratorType === "kubernetes") {
			const k8sAdapter = new KubernetesAdapter({
				inCluster: !serverConfig.k8sKubeconfig && !serverConfig.k8sApiEndpoint,
				kubeconfig: serverConfig.k8sKubeconfig,
				context: serverConfig.k8sContext,
				namespace: serverConfig.k8sNamespace || "dokploy",
			});

			adapterCache.set(cacheKey, k8sAdapter);
			return k8sAdapter;
		}

		// If orchestrator type is swarm, use swarm adapter
		if (serverConfig.orchestratorType === "swarm") {
			const swarmAdapter = new SwarmAdapter(serverConfig);
			adapterCache.set(cacheKey, swarmAdapter);
			return swarmAdapter;
		}

		// Auto-detect orchestrator type
		const detectedType = await this.detectOrchestrator(serverConfig);

		// Update server record with detected type
		if (serverConfig.serverId) {
			await this.updateServerOrchestrator(serverConfig.serverId, detectedType);
		}

		if (detectedType === "kubernetes") {
			const k8sAdapter = new KubernetesAdapter({
				inCluster: !serverConfig.k8sKubeconfig && !serverConfig.k8sApiEndpoint,
				kubeconfig: serverConfig.k8sKubeconfig,
				context: serverConfig.k8sContext,
				namespace: serverConfig.k8sNamespace || "dokploy",
			});

			adapterCache.set(cacheKey, k8sAdapter);

			// Detect and update K8s capabilities
			const capabilities = await this.detectK8sCapabilities(k8sAdapter);
			if (serverConfig.serverId) {
				await this.updateServerK8sCapabilities(serverConfig.serverId, capabilities);
			}

			console.log(`✅ Kubernetes detected on server ${serverConfig.name || cacheKey}`);
			return k8sAdapter;
		}

		// Default to Swarm
		const swarmAdapter = new SwarmAdapter(serverConfig);
		adapterCache.set(cacheKey, swarmAdapter);

		console.log(`⚙️  Docker Swarm used on server ${serverConfig.name || cacheKey}`);
		return swarmAdapter;
	}

	/**
	 * Create adapter from application ID
	 *
	 * @param applicationId Application ID
	 * @returns Orchestrator adapter for the application's server
	 */
	static async forApplication(applicationId: string): Promise<IOrchestratorAdapter> {
		const app = await db.query.applications.findFirst({
			where: eq(applications.applicationId, applicationId),
			with: { server: true },
		});

		if (!app) {
			throw new Error(`Application not found: ${applicationId}`);
		}

		if (!app.server) {
			// Local server
			return this.create({
				serverId: "",
				name: "local",
				orchestratorType: "swarm",
				ipAddress: "127.0.0.1",
				port: 22,
				username: "root",
			});
		}

		return this.create({
			serverId: app.server.serverId,
			name: app.server.name,
			orchestratorType: app.server.orchestratorType as OrchestratorType,
			ipAddress: app.server.ipAddress,
			port: app.server.port,
			username: app.server.username,
			sshKeyId: app.server.sshKeyId || undefined,
			k8sContext: app.server.k8sContext || undefined,
			k8sNamespace: app.server.k8sNamespace || undefined,
			k8sApiEndpoint: app.server.k8sApiEndpoint || undefined,
			k8sKubeconfig: app.server.k8sKubeconfig || undefined,
			k8sCapabilities: app.server.k8sCapabilities || undefined,
		});
	}

	/**
	 * Create adapter from server ID
	 *
	 * @param serverId Server ID (null for local)
	 * @returns Orchestrator adapter for the server
	 */
	static async forServer(serverId: string | null): Promise<IOrchestratorAdapter> {
		if (!serverId) {
			// Local server
			return this.create({
				serverId: "",
				name: "local",
				orchestratorType: "swarm",
				ipAddress: "127.0.0.1",
				port: 22,
				username: "root",
			});
		}

		const server = await db.query.server.findFirst({
			where: eq(serverTable.serverId, serverId),
		});

		if (!server) {
			throw new Error(`Server not found: ${serverId}`);
		}

		return this.create({
			serverId: server.serverId,
			name: server.name,
			orchestratorType: server.orchestratorType as OrchestratorType,
			ipAddress: server.ipAddress,
			port: server.port,
			username: server.username,
			sshKeyId: server.sshKeyId || undefined,
			k8sContext: server.k8sContext || undefined,
			k8sNamespace: server.k8sNamespace || undefined,
			k8sApiEndpoint: server.k8sApiEndpoint || undefined,
			k8sKubeconfig: server.k8sKubeconfig || undefined,
			k8sCapabilities: server.k8sCapabilities || undefined,
		});
	}

	/**
	 * Detect orchestrator type for a server
	 *
	 * @param serverConfig Server configuration
	 * @returns Detected orchestrator type
	 */
	static async detectOrchestrator(serverConfig: ServerConfig): Promise<OrchestratorType> {
		// First, try Kubernetes
		if (serverConfig.k8sKubeconfig || serverConfig.k8sApiEndpoint) {
			try {
				const k8sAdapter = new KubernetesAdapter({
					kubeconfig: serverConfig.k8sKubeconfig,
					context: serverConfig.k8sContext,
					namespace: serverConfig.k8sNamespace || "dokploy",
				});

				const type = await k8sAdapter.detect();
				if (type === "kubernetes") {
					return "kubernetes";
				}
			} catch {
				// K8s not available
			}
		}

		// Try Swarm detection
		try {
			const swarmAdapter = new SwarmAdapter(serverConfig);
			const health = await swarmAdapter.healthCheck();

			if (health.healthy) {
				return "swarm";
			}
		} catch {
			// Swarm not available
		}

		// Default to swarm (legacy behavior)
		return "swarm";
	}

	/**
	 * Detect Kubernetes capabilities
	 *
	 * @param adapter Kubernetes adapter
	 * @returns Detected capabilities
	 */
	static async detectK8sCapabilities(
		adapter: KubernetesAdapter,
	): Promise<NonNullable<ServerConfig["k8sCapabilities"]>> {
		const capabilities: NonNullable<ServerConfig["k8sCapabilities"]> = {
			supportsHPA: false,
			supportsNetworkPolicies: false,
			metricsServerInstalled: false,
			ingressController: null,
			storageClasses: [],
			supportsPodDisruptionBudget: false,
		};

		try {
			// Check HPA support (try to list HPAs)
			try {
				await adapter.getHPAStatus("test-nonexistent", "default");
				capabilities.supportsHPA = true;
			} catch (error) {
				// 404 means HPA API exists but resource not found (good)
				// Other errors mean no HPA support
				if (error instanceof Error && error.message.includes("404")) {
					capabilities.supportsHPA = true;
				}
			}

			// Check metrics server
			try {
				const metrics = await adapter.getMetrics("test-nonexistent", "default");
				capabilities.metricsServerInstalled = metrics !== null;
			} catch {
				capabilities.metricsServerInstalled = false;
			}

			// Check network policies support
			try {
				await adapter.getNetworkPolicy("test-nonexistent", "default");
				capabilities.supportsNetworkPolicies = true;
			} catch (error) {
				if (error instanceof Error && error.message.includes("404")) {
					capabilities.supportsNetworkPolicies = true;
				}
			}

			// Check for Traefik IngressRoute CRD
			try {
				const traefik = await adapter.getCustomResource(
					"traefik.io/v1alpha1",
					"IngressRoute",
					"test-nonexistent",
					"default",
				);
				// If we get here without error (404 is OK), Traefik CRDs exist
				capabilities.ingressController = "traefik";
			} catch (error) {
				if (error instanceof Error && error.message.includes("404")) {
					capabilities.ingressController = "traefik";
				}
			}

			// Check PDB support
			try {
				// The fact that we can compile with PolicyV1Api means PDB is supported
				capabilities.supportsPodDisruptionBudget = true;
			} catch {
				capabilities.supportsPodDisruptionBudget = false;
			}
		} catch {
			// Keep default values on error
		}

		return capabilities;
	}

	/**
	 * Update server orchestrator type in database
	 */
	private static async updateServerOrchestrator(
		serverId: string,
		orchestratorType: OrchestratorType,
	): Promise<void> {
		await db
			.update(serverTable)
			.set({ orchestratorType })
			.where(eq(serverTable.serverId, serverId));
	}

	/**
	 * Update server K8s capabilities in database
	 */
	private static async updateServerK8sCapabilities(
		serverId: string,
		capabilities: NonNullable<ServerConfig["k8sCapabilities"]>,
	): Promise<void> {
		await db
			.update(serverTable)
			.set({ k8sCapabilities: capabilities })
			.where(eq(serverTable.serverId, serverId));
	}

	/**
	 * Clear adapter cache for a specific server or all
	 *
	 * @param serverId Server ID to clear, or undefined to clear all
	 */
	static clearCache(serverId?: string): void {
		if (serverId) {
			adapterCache.delete(serverId);
		} else {
			adapterCache.clear();
		}
	}

	/**
	 * Get adapter from cache without creating
	 *
	 * @param serverId Server ID
	 * @returns Cached adapter or undefined
	 */
	static getCached(serverId: string): IOrchestratorAdapter | undefined {
		return adapterCache.get(serverId);
	}

	/**
	 * Check if server is using Kubernetes
	 *
	 * @param serverId Server ID
	 * @returns True if server uses Kubernetes
	 */
	static async isKubernetes(serverId: string | null): Promise<boolean> {
		if (!serverId) {
			return false;
		}

		const server = await db.query.server.findFirst({
			where: eq(serverTable.serverId, serverId),
		});

		return server?.orchestratorType === "kubernetes";
	}

	/**
	 * Check if server is using Docker Swarm
	 *
	 * @param serverId Server ID
	 * @returns True if server uses Docker Swarm
	 */
	static async isSwarm(serverId: string | null): Promise<boolean> {
		if (!serverId) {
			return true; // Local server is always Swarm
		}

		const server = await db.query.server.findFirst({
			where: eq(serverTable.serverId, serverId),
		});

		return server?.orchestratorType === "swarm";
	}
}

// Export factory instance for convenience
export const orchestratorFactory = OrchestratorFactory;
