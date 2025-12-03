/**
 * Orchestrator Module - Unified API for Docker Swarm and Kubernetes
 *
 * This module provides:
 * - IOrchestratorAdapter: Interface for orchestrator operations
 * - SwarmAdapter: Docker Swarm implementation
 * - KubernetesAdapter: Kubernetes implementation
 * - OrchestratorFactory: Factory for auto-detection and creation
 *
 * Usage:
 * ```typescript
 * import { OrchestratorFactory } from "@dokploy/server/services/orchestrator";
 *
 * // Get adapter for a server
 * const adapter = await OrchestratorFactory.forServer(serverId);
 *
 * // Deploy application
 * await adapter.deployApplication({
 *   name: "my-app",
 *   image: "nginx:latest",
 *   replicas: 2,
 *   env: { NODE_ENV: "production" },
 *   ports: [{ containerPort: 80 }],
 * });
 *
 * // Scale application
 * await adapter.scaleApplication("my-app", 5);
 *
 * // Configure HPA (K8s only)
 * if (supportsHPA(adapter)) {
 *   await adapter.configureHPA({
 *     enabled: true,
 *     targetName: "my-app",
 *     minReplicas: 2,
 *     maxReplicas: 10,
 *     targetCPU: 80,
 *   });
 * }
 * ```
 */

// Interface and type guards
export type { IOrchestratorAdapter } from "./base.interface";
export {
	supportsHPA,
	supportsNetworkPolicies,
	supportsCustomResources,
	supportsNamespaces,
} from "./base.interface";

// Types
export type {
	// Core types
	OrchestratorType,
	HealthStatus,
	DeploymentStatus,
	// Deployment types
	DeploymentConfig,
	Deployment,
	DeploymentCondition,
	Port,
	Volume,
	ResourceRequirements,
	ProbeConfig,
	// Service types
	ServiceConfig,
	Service,
	ServicePort,
	ServiceType,
	// Ingress types
	IngressConfig,
	Ingress,
	IngressRule,
	// HPA types
	HPAConfig,
	HPAStatus,
	HPABehavior,
	CustomMetric,
	ScalingPolicy,
	// Network Policy types
	NetworkPolicyConfig,
	NetworkPolicyRule,
	NetworkPolicyPeer,
	// Metrics types
	ResourceMetrics,
	ContainerMetrics,
	// Log types
	LogOptions,
	// Custom Resource types
	CustomResource,
	// Configuration types
	ServerConfig,
	K8sAdapterConfig,
	// Migration types
	MigrationResult,
} from "./types";

// Adapters
export { SwarmAdapter } from "./swarm.adapter";
export { KubernetesAdapter } from "./kubernetes.adapter";

// Factory
export { OrchestratorFactory, orchestratorFactory } from "./factory";
