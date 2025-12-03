/**
 * IOrchestratorAdapter - Abstraction Interface for Orchestrators
 *
 * This interface defines the contract that both SwarmAdapter and KubernetesAdapter
 * must implement, ensuring a unified API for deployment operations regardless
 * of the underlying orchestrator.
 */

import type {
	CustomResource,
	Deployment,
	DeploymentConfig,
	HealthStatus,
	HPAConfig,
	HPAStatus,
	Ingress,
	IngressConfig,
	LogOptions,
	NetworkPolicyConfig,
	OrchestratorType,
	ResourceMetrics,
	Service,
	ServiceConfig,
} from "./types";

export interface IOrchestratorAdapter {
	// ==========================================================================
	// Detection & Health
	// ==========================================================================

	/**
	 * Detect the orchestrator type
	 * @returns The type of orchestrator (swarm or kubernetes)
	 */
	detect(): Promise<OrchestratorType>;

	/**
	 * Check the health of the orchestrator
	 * @returns Health status with details
	 */
	healthCheck(): Promise<HealthStatus>;

	/**
	 * Get the orchestrator version
	 * @returns Version string
	 */
	getVersion(): Promise<string>;

	// ==========================================================================
	// Deployment Management
	// ==========================================================================

	/**
	 * Deploy an application
	 * @param config Deployment configuration
	 * @returns Deployed deployment object
	 */
	deployApplication(config: DeploymentConfig): Promise<Deployment>;

	/**
	 * Get deployment information
	 * @param name Deployment name
	 * @param namespace Optional namespace (K8s only)
	 * @returns Deployment object or null if not found
	 */
	getDeployment(name: string, namespace?: string): Promise<Deployment | null>;

	/**
	 * Scale an application
	 * @param name Application name
	 * @param replicas Target number of replicas
	 * @param namespace Optional namespace (K8s only)
	 */
	scaleApplication(
		name: string,
		replicas: number,
		namespace?: string,
	): Promise<void>;

	/**
	 * Update an application deployment
	 * @param name Application name
	 * @param config Partial deployment config to update
	 * @param namespace Optional namespace (K8s only)
	 */
	updateApplication(
		name: string,
		config: Partial<DeploymentConfig>,
		namespace?: string,
	): Promise<Deployment>;

	/**
	 * Delete an application deployment
	 * @param name Application name
	 * @param namespace Optional namespace (K8s only)
	 */
	deleteApplication(name: string, namespace?: string): Promise<void>;

	/**
	 * Rollback an application to a previous revision
	 * @param name Application name
	 * @param revision Optional specific revision (defaults to previous)
	 * @param namespace Optional namespace (K8s only)
	 */
	rollbackApplication(
		name: string,
		revision?: number,
		namespace?: string,
	): Promise<void>;

	/**
	 * Restart an application (rolling restart)
	 * @param name Application name
	 * @param namespace Optional namespace (K8s only)
	 */
	restartApplication(name: string, namespace?: string): Promise<void>;

	/**
	 * List all deployments
	 * @param namespace Optional namespace filter (K8s only)
	 * @param labelSelector Optional label selector
	 */
	listDeployments(
		namespace?: string,
		labelSelector?: string,
	): Promise<Deployment[]>;

	// ==========================================================================
	// Service Discovery
	// ==========================================================================

	/**
	 * Create a service for internal communication
	 * @param config Service configuration
	 * @returns Created service object
	 */
	createService(config: ServiceConfig): Promise<Service>;

	/**
	 * Get service information
	 * @param name Service name
	 * @param namespace Optional namespace (K8s only)
	 * @returns Service object or null if not found
	 */
	getService(name: string, namespace?: string): Promise<Service | null>;

	/**
	 * Update a service
	 * @param name Service name
	 * @param config Partial service config to update
	 * @param namespace Optional namespace (K8s only)
	 */
	updateService(
		name: string,
		config: Partial<ServiceConfig>,
		namespace?: string,
	): Promise<Service>;

	/**
	 * Delete a service
	 * @param name Service name
	 * @param namespace Optional namespace (K8s only)
	 */
	deleteService(name: string, namespace?: string): Promise<void>;

	// ==========================================================================
	// Ingress/Routing (Traefik)
	// ==========================================================================

	/**
	 * Configure ingress routing (Traefik)
	 * @param config Ingress configuration
	 */
	configureIngress(config: IngressConfig): Promise<Ingress>;

	/**
	 * Get ingress configuration
	 * @param name Ingress name
	 * @param namespace Optional namespace (K8s only)
	 */
	getIngress(name: string, namespace?: string): Promise<Ingress | null>;

	/**
	 * Delete ingress configuration
	 * @param name Ingress name
	 * @param namespace Optional namespace (K8s only)
	 */
	deleteIngress(name: string, namespace?: string): Promise<void>;

	// ==========================================================================
	// Monitoring & Logs
	// ==========================================================================

	/**
	 * Get resource metrics for a deployment
	 * @param name Deployment/Pod name
	 * @param namespace Optional namespace (K8s only)
	 * @returns Resource metrics
	 */
	getMetrics(name: string, namespace?: string): Promise<ResourceMetrics | null>;

	/**
	 * Get logs from a deployment/container
	 * @param name Deployment/Pod name
	 * @param options Log options (tail, follow, etc.)
	 * @param namespace Optional namespace (K8s only)
	 * @returns Array of log lines
	 */
	getLogs(
		name: string,
		options?: LogOptions,
		namespace?: string,
	): Promise<string[]>;

	/**
	 * Stream logs from a deployment/container
	 * @param name Deployment/Pod name
	 * @param callback Callback function for each log line
	 * @param options Log options
	 * @param namespace Optional namespace (K8s only)
	 * @returns Cleanup function to stop streaming
	 */
	streamLogs(
		name: string,
		callback: (log: string) => void,
		options?: LogOptions,
		namespace?: string,
	): Promise<() => void>;

	// ==========================================================================
	// Autoscaling (Optional - K8s feature)
	// ==========================================================================

	/**
	 * Configure Horizontal Pod Autoscaler
	 * @param config HPA configuration
	 * @throws Error if not supported (Swarm)
	 */
	configureHPA?(config: HPAConfig): Promise<void>;

	/**
	 * Get HPA status
	 * @param name HPA name
	 * @param namespace Optional namespace
	 */
	getHPAStatus?(name: string, namespace?: string): Promise<HPAStatus | null>;

	/**
	 * Delete HPA
	 * @param name HPA name
	 * @param namespace Optional namespace
	 */
	deleteHPA?(name: string, namespace?: string): Promise<void>;

	// ==========================================================================
	// Network Policies (Optional - K8s feature)
	// ==========================================================================

	/**
	 * Create network policy
	 * @param policy Network policy configuration
	 * @throws Error if not supported (Swarm)
	 */
	createNetworkPolicy?(policy: NetworkPolicyConfig): Promise<void>;

	/**
	 * Get network policy
	 * @param name Policy name
	 * @param namespace Optional namespace
	 */
	getNetworkPolicy?(
		name: string,
		namespace?: string,
	): Promise<NetworkPolicyConfig | null>;

	/**
	 * Delete network policy
	 * @param name Policy name
	 * @param namespace Optional namespace
	 */
	deleteNetworkPolicy?(name: string, namespace?: string): Promise<void>;

	// ==========================================================================
	// Custom Resources (K8s only)
	// ==========================================================================

	/**
	 * Create a custom resource (CRD)
	 * @param resource Custom resource definition
	 */
	createCustomResource?(resource: CustomResource): Promise<CustomResource>;

	/**
	 * Get a custom resource
	 * @param apiVersion API version
	 * @param kind Resource kind
	 * @param name Resource name
	 * @param namespace Optional namespace
	 */
	getCustomResource?(
		apiVersion: string,
		kind: string,
		name: string,
		namespace?: string,
	): Promise<CustomResource | null>;

	/**
	 * Delete a custom resource
	 * @param apiVersion API version
	 * @param kind Resource kind
	 * @param name Resource name
	 * @param namespace Optional namespace
	 */
	deleteCustomResource?(
		apiVersion: string,
		kind: string,
		name: string,
		namespace?: string,
	): Promise<void>;

	// ==========================================================================
	// Namespace Management (K8s only)
	// ==========================================================================

	/**
	 * Ensure namespace exists
	 * @param namespace Namespace name
	 */
	ensureNamespace?(namespace: string): Promise<void>;

	/**
	 * List namespaces
	 */
	listNamespaces?(): Promise<string[]>;

	// ==========================================================================
	// Events
	// ==========================================================================

	/**
	 * Get events for a resource
	 * @param name Resource name
	 * @param namespace Optional namespace
	 */
	getEvents(
		name: string,
		namespace?: string,
	): Promise<
		Array<{
			type: "Normal" | "Warning";
			reason: string;
			message: string;
			count: number;
			firstTimestamp: Date;
			lastTimestamp: Date;
		}>
	>;
}

/**
 * Type guard to check if adapter supports HPA
 */
export function supportsHPA(
	adapter: IOrchestratorAdapter,
): adapter is IOrchestratorAdapter &
	Required<
		Pick<IOrchestratorAdapter, "configureHPA" | "getHPAStatus" | "deleteHPA">
	> {
	return (
		typeof adapter.configureHPA === "function" &&
		typeof adapter.getHPAStatus === "function" &&
		typeof adapter.deleteHPA === "function"
	);
}

/**
 * Type guard to check if adapter supports Network Policies
 */
export function supportsNetworkPolicies(
	adapter: IOrchestratorAdapter,
): adapter is IOrchestratorAdapter &
	Required<
		Pick<
			IOrchestratorAdapter,
			"createNetworkPolicy" | "getNetworkPolicy" | "deleteNetworkPolicy"
		>
	> {
	return (
		typeof adapter.createNetworkPolicy === "function" &&
		typeof adapter.getNetworkPolicy === "function" &&
		typeof adapter.deleteNetworkPolicy === "function"
	);
}

/**
 * Type guard to check if adapter supports Custom Resources
 */
export function supportsCustomResources(
	adapter: IOrchestratorAdapter,
): adapter is IOrchestratorAdapter &
	Required<
		Pick<
			IOrchestratorAdapter,
			"createCustomResource" | "getCustomResource" | "deleteCustomResource"
		>
	> {
	return (
		typeof adapter.createCustomResource === "function" &&
		typeof adapter.getCustomResource === "function" &&
		typeof adapter.deleteCustomResource === "function"
	);
}

/**
 * Type guard to check if adapter supports Namespaces
 */
export function supportsNamespaces(
	adapter: IOrchestratorAdapter,
): adapter is IOrchestratorAdapter &
	Required<Pick<IOrchestratorAdapter, "ensureNamespace" | "listNamespaces">> {
	return (
		typeof adapter.ensureNamespace === "function" &&
		typeof adapter.listNamespaces === "function"
	);
}
