/**
 * Orchestrator Types - Shared types for Swarm and Kubernetes adapters
 *
 * This file contains unified types that abstract over the differences between
 * Docker Swarm and Kubernetes orchestrators.
 */

// =============================================================================
// Orchestrator Type
// =============================================================================

export type OrchestratorType = "swarm" | "kubernetes";

// =============================================================================
// Health & Status Types
// =============================================================================

export interface HealthStatus {
	healthy: boolean;
	message: string;
	details?: {
		version?: string;
		nodes?: number;
		apiEndpoint?: string;
		lastCheck?: Date;
	};
}

export type DeploymentStatus =
	| "pending"
	| "running"
	| "succeeded"
	| "failed"
	| "updating"
	| "scaling";

// =============================================================================
// Deployment Configuration
// =============================================================================

export interface Port {
	containerPort: number;
	protocol?: "TCP" | "UDP";
	publishedPort?: number;
	publishMode?: "ingress" | "host";
}

export interface Volume {
	name: string;
	mountPath: string;
	pvcName?: string; // For K8s PersistentVolumeClaim
	hostPath?: string; // For host-mounted volumes
	readOnly?: boolean;
}

export interface ResourceRequirements {
	requests: {
		cpu: string; // e.g., "100m"
		memory: string; // e.g., "128Mi"
	};
	limits: {
		cpu: string; // e.g., "500m"
		memory: string; // e.g., "512Mi"
	};
}

export interface ProbeConfig {
	httpGet?: {
		path: string;
		port: number;
		scheme?: "HTTP" | "HTTPS";
	};
	tcpSocket?: {
		port: number;
	};
	exec?: {
		command: string[];
	};
	initialDelaySeconds: number;
	periodSeconds: number;
	timeoutSeconds: number;
	failureThreshold: number;
	successThreshold?: number;
}

export interface DeploymentConfig {
	name: string;
	namespace?: string;
	image: string;
	replicas: number;
	env: Record<string, string>;
	ports: Port[];
	volumes?: Volume[];
	resources?: ResourceRequirements;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
	command?: string[];
	args?: string[];

	// Health checks
	healthCheck?: ProbeConfig;
	readinessProbe?: ProbeConfig;
	livenessProbe?: ProbeConfig;
	startupProbe?: ProbeConfig;

	// Deployment strategy
	strategy?: {
		type: "rolling" | "recreate" | "blue-green" | "canary";
		rollingUpdate?: {
			maxSurge: string | number;
			maxUnavailable: string | number;
		};
	};

	// Domain configuration for Traefik
	domain?: string;
	ssl?: boolean;

	// HPA configuration
	hpa?: HPAConfig;

	// Network Policy
	networkPolicy?: NetworkPolicyConfig;

	// Service Account
	serviceAccount?: string;

	// Pod Disruption Budget
	pdb?: {
		minAvailable?: number;
		maxUnavailable?: number;
	};
}

// =============================================================================
// Deployment Result
// =============================================================================

export interface Deployment {
	name: string;
	namespace?: string;
	status: DeploymentStatus;
	replicas: {
		desired: number;
		ready: number;
		available: number;
		unavailable?: number;
	};
	image: string;
	createdAt?: Date;
	updatedAt?: Date;
	conditions?: DeploymentCondition[];
}

export interface DeploymentCondition {
	type: string;
	status: "True" | "False" | "Unknown";
	reason?: string;
	message?: string;
	lastTransitionTime?: Date;
}

// =============================================================================
// Service Types
// =============================================================================

export type ServiceType = "ClusterIP" | "NodePort" | "LoadBalancer";

export interface ServiceConfig {
	name: string;
	namespace?: string;
	selector: Record<string, string>;
	ports: ServicePort[];
	type?: ServiceType;
}

export interface ServicePort {
	name?: string;
	port: number;
	targetPort: number;
	protocol?: "TCP" | "UDP";
	nodePort?: number;
}

export interface Service {
	name: string;
	namespace?: string;
	type: ServiceType;
	clusterIP?: string;
	externalIP?: string[];
	ports: ServicePort[];
	selector: Record<string, string>;
}

// =============================================================================
// Ingress Types (Traefik)
// =============================================================================

export interface IngressConfig {
	name: string;
	namespace?: string;
	domain: string;
	serviceName: string;
	servicePort: number;
	ssl?: boolean;
	certResolver?: string;
	middlewares?: string[];
	pathPrefix?: string;
	stripPrefix?: boolean;
}

export interface Ingress {
	name: string;
	namespace?: string;
	hosts: string[];
	tls?: boolean;
	rules: IngressRule[];
}

export interface IngressRule {
	host: string;
	paths: {
		path: string;
		pathType: "Prefix" | "Exact" | "ImplementationSpecific";
		serviceName: string;
		servicePort: number;
	}[];
}

// =============================================================================
// HPA (Horizontal Pod Autoscaler) Types
// =============================================================================

export interface HPAConfig {
	enabled: boolean;
	name?: string;
	namespace?: string;
	targetName: string;
	minReplicas: number;
	maxReplicas: number;
	targetCPU?: number; // Percentage
	targetMemory?: number; // Percentage
	customMetrics?: CustomMetric[];
	behavior?: HPABehavior;
}

export interface CustomMetric {
	name: string;
	type: "resource" | "pods" | "external";
	target: {
		type: "Utilization" | "Value" | "AverageValue";
		value?: string;
		averageValue?: string;
		averageUtilization?: number;
	};
}

export interface HPABehavior {
	scaleDown?: {
		stabilizationWindowSeconds?: number;
		policies?: ScalingPolicy[];
	};
	scaleUp?: {
		stabilizationWindowSeconds?: number;
		policies?: ScalingPolicy[];
	};
}

export interface ScalingPolicy {
	type: "Pods" | "Percent";
	value: number;
	periodSeconds: number;
}

export interface HPAStatus {
	currentReplicas: number;
	desiredReplicas: number;
	currentMetrics?: {
		name: string;
		currentValue: string;
		targetValue: string;
	}[];
	conditions?: {
		type: string;
		status: "True" | "False" | "Unknown";
		reason?: string;
		message?: string;
	}[];
	lastScaleTime?: Date;
}

// =============================================================================
// Network Policy Types
// =============================================================================

export interface NetworkPolicyConfig {
	name: string;
	namespace?: string;
	podSelector: Record<string, string>;
	policyTypes: ("Ingress" | "Egress")[];
	ingress?: NetworkPolicyRule[];
	egress?: NetworkPolicyRule[];
}

export interface NetworkPolicyRule {
	from?: NetworkPolicyPeer[];
	to?: NetworkPolicyPeer[];
	ports?: {
		protocol?: "TCP" | "UDP";
		port?: number | string;
	}[];
}

export interface NetworkPolicyPeer {
	podSelector?: Record<string, string>;
	namespaceSelector?: Record<string, string>;
	ipBlock?: {
		cidr: string;
		except?: string[];
	};
}

// =============================================================================
// Resource Metrics
// =============================================================================

export interface ResourceMetrics {
	name: string;
	namespace?: string;
	timestamp: Date;
	containers: ContainerMetrics[];
	totalCPU: string;
	totalMemory: string;
}

export interface ContainerMetrics {
	name: string;
	cpu: {
		usage: string; // e.g., "100m"
		usageNanoCores?: number;
	};
	memory: {
		usage: string; // e.g., "256Mi"
		usageBytes?: number;
		workingSet?: string;
	};
}

// =============================================================================
// Log Options
// =============================================================================

export interface LogOptions {
	follow?: boolean;
	tailLines?: number;
	sinceSeconds?: number;
	sinceTime?: Date;
	timestamps?: boolean;
	container?: string;
	previous?: boolean;
}

// =============================================================================
// Kubernetes-specific Custom Resources
// =============================================================================

export interface CustomResource {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		namespace?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	spec: Record<string, unknown>;
	status?: Record<string, unknown>;
}

// =============================================================================
// Server Configuration
// =============================================================================

export interface ServerConfig {
	serverId: string;
	name: string;
	orchestratorType: OrchestratorType;
	ipAddress: string;
	port: number;
	username: string;
	sshKeyId?: string;

	// Kubernetes-specific
	k8sContext?: string;
	k8sNamespace?: string;
	k8sApiEndpoint?: string;
	k8sKubeconfig?: string;
	k8sCapabilities?: {
		supportsHPA: boolean;
		supportsNetworkPolicies: boolean;
		metricsServerInstalled: boolean;
		ingressController: string | null;
		storageClasses: string[];
		supportsPodDisruptionBudget: boolean;
	};
}

// =============================================================================
// K8s Configuration for Adapter
// =============================================================================

export interface K8sAdapterConfig {
	inCluster?: boolean;
	kubeconfigPath?: string;
	kubeconfig?: string; // Base64 encoded or raw YAML
	context?: string;
	namespace: string;
}

// =============================================================================
// Migration Types
// =============================================================================

export interface MigrationResult {
	success: boolean;
	deployedApps: string[];
	failedApps: {
		name: string;
		error: string;
	}[];
	warnings: string[];
}
